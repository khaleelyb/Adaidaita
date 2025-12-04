import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

export class AuthService {
  // Sign up new user
  async signUp(email: string, password: string, name: string, role: UserRole) {
    const { data, error } = await supabase.auth.signUp({
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
    });

    if (error) throw error;
    return data;
  }

  // Sign in existing user
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

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
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  // Get current user profile from database
  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await this.getSession();
      if (!session?.user) {
        console.log('No active session');
        return null;
      }

      console.log('Fetching user profile for auth_user_id:', session.user.id);

      // First, try to get user by auth_user_id
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .single();

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
        const user = await this.getCurrentUser();
        callback(user);
      } else {
        callback(null);
      }
    });
  }
}

export const authService = new AuthService();
