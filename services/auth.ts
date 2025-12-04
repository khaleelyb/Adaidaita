import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Helper to timeout promises
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export class AuthService {
  // Sign up new user
  async signUp(email: string, password: string, name: string, role: UserRole) {
    console.log('Attempting sign up...', email);
    const { data, error } = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
            avatar_url: `https://i.pravatar.cc/150?u=${email}`
          },
          emailRedirectTo: window.location.origin
        }
      }),
      10000,
      'Sign up'
    );

    if (error) throw error;
    return data;
  }

  // Sign in existing user
  async signIn(email: string, password: string) {
    console.log('Attempting sign in...', email);
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email,
        password
      }),
      15000, // 15s timeout for login
      'Sign in'
    );

    if (error) throw error;
    return data;
  }

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // Get current session
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  }

  // Get current user profile from database
  async getCurrentUser(): Promise<User | null> {
    try {
      // Short timeout for session check
      const session = await withTimeout(this.getSession(), 5000, 'Get session');
      
      if (!session?.user) {
        console.log('No active session');
        return null;
      }

      console.log('Fetching user profile for auth_user_id:', session.user.id);

      // Fetch user profile with timeout
      const { data, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .single(),
        10000,
        'Fetch user profile'
      );

      if (error) {
        console.error('Error fetching user profile:', error);
        
        // If user doesn't exist in users table, create it
        if (error.code === 'PGRST116') {
          console.log('User profile not found, creating one...');
          return await this.createUserProfile(session.user);
        }
        
        return null;
      }

      if (!data) {
        console.log('No user data found');
        return null;
      }

      console.log('User profile fetched:', data);

      return {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role as UserRole,
        avatarUrl: data.avatar_url,
        vehicleModel: data.vehicle_model,
        vehiclePlate: data.vehicle_plate,
        rating: data.rating
      };
    } catch (err) {
      console.error('Unexpected error in getCurrentUser:', err);
      return null;
    }
  }

  // Create user profile if it doesn't exist
  private async createUserProfile(authUser: any): Promise<User | null> {
    try {
      const metadata = authUser.user_metadata || {};
      
      const { data, error } = await supabase
        .from('users')
        .insert({
          auth_user_id: authUser.id,
          email: authUser.email,
          name: metadata.name || authUser.email?.split('@')[0] || 'User',
          role: metadata.role || UserRole.RIDER,
          avatar_url: metadata.avatar_url || `https://i.pravatar.cc/150?u=${authUser.email}`
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating user profile:', error);
        return null;
      }

      console.log('User profile created:', data);

      return {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role as UserRole,
        avatarUrl: data.avatar_url,
        vehicleModel: data.vehicle_model,
        vehiclePlate: data.vehicle_plate,
        rating: data.rating
      };
    } catch (err) {
      console.error('Error in createUserProfile:', err);
      return null;
    }
  }

  // Listen to auth state changes
  onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      if (session?.user) {
        // Debounce or ensure we don't spam checks?
        // For now, just fetching is fine.
        const user = await this.getCurrentUser();
        callback(user);
      } else {
        callback(null);
      }
    });
  }
}

export const authService = new AuthService();
