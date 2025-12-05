import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage, // Explicitly use localStorage
    storageKey: 'adaidaita-auth-token', // Custom key to avoid conflicts
  }
});

// Enhanced logging helper
const log = {
  info: (msg: string, data?: any) => console.log(`[Auth] ℹ️ ${msg}`, data || ''),
  error: (msg: string, error?: any) => console.error(`[Auth] ❌ ${msg}`, error || ''),
  success: (msg: string, data?: any) => console.log(`[Auth] ✅ ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[Auth] ⚠️ ${msg}`, data || '')
};

export class AuthService {
  // Sign up new user
  async signUp(email: string, password: string, name: string, role: UserRole) {
    try {
      log.info('Starting sign up...', { email, role });
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
            avatar_url: `https://i.pravatar.cc/150?u=${email}`
          }
        }
      });

      if (authError) {
        log.error('Signup failed', authError);
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Account creation failed');
      }

      log.success('User created', { id: authData.user.id });

      // Create profile
      // Note: In production, this should ideally be handled by a Database Trigger
      try {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: authData.user.email!,
            name,
            role,
            avatar_url: `https://i.pravatar.cc/150?u=${email}`
          });

        if (profileError && profileError.code !== '23505') { // 23505 is unique violation (already exists)
          log.warn('Profile creation warning', profileError);
        }
      } catch (err) {
        log.warn('Profile creation exception (may be handled by trigger)', err);
      }

      return authData;
    } catch (error: any) {
      log.error('Signup error', error);
      throw error;
    }
  }

  // Sign in existing user
  async signIn(email: string, password: string) {
    try {
      log.info('Signing in...', { email });
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        log.error('Sign in failed', error);
        
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Please confirm your email first');
        }
        throw new Error(error.message);
      }

      if (!data.user || !data.session) {
        throw new Error('Sign in failed - no session created');
      }

      log.success('Signed in successfully', { 
        id: data.user.id, 
        email: data.user.email 
      });

      // Attempt to ensure profile exists
      this.ensureProfile(data.user);

      return data;
    } catch (error: any) {
      log.error('Sign in error', error);
      throw error;
    }
  }

  // Helper to ensure profile exists or create if missing (non-blocking)
  private async ensureProfile(user: any) {
     const profile = await this.getUserProfile(user.id);
     if (!profile) {
       log.warn('Profile missing after login, creating...');
       await this.createUserProfile(user);
     }
  }

  // Sign out
  async signOut() {
    try {
      log.info('Signing out...');
      
      const user = await this.getCurrentUser();
      if (user && user.role === UserRole.DRIVER) {
        await supabase.from('users')
          .update({ is_online: false })
          .eq('id', user.id);
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        log.error('Sign out failed', error);
      } else {
        log.success('Signed out');
      }
    } catch (error: any) {
      log.error('Sign out error', error);
    }
  }

  // Get current session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        log.error('Get session failed', error);
        return null;
      }

      if (session) {
        log.info('Session found', { userId: session.user.id });
      } else {
        log.info('No active session');
      }

      return session;
    } catch (error: any) {
      log.error('Get session error', error);
      return null;
    }
  }

  // Get user profile from database
  private async getUserProfile(userId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Row not found
          return null;
        }
        log.error('Error fetching profile', error);
        return null;
      }

      return data;
    } catch (error) {
      log.error('Get profile exception', error);
      return null;
    }
  }

  // Get current user with profile
  async getCurrentUser(): Promise<User | null> {
    try {
      log.info('Getting current user...');
      
      const session = await this.getSession();
      
      if (!session?.user) {
        log.info('No session found');
        return null;
      }

      // Fetch profile from DB
      let profile = await this.getUserProfile(session.user.id);

      // If no profile, try to create one
      if (!profile) {
        log.warn('Profile missing, attempting creation...');
        profile = await this.createUserProfile(session.user);
        
        if (!profile) {
          // Fallback to session metadata if database creation fails
          log.warn('Using session metadata as fallback');
          const metadata = session.user.user_metadata || {};
          
          return {
            id: session.user.id,
            email: session.user.email || '',
            name: metadata.name || session.user.email?.split('@')[0] || 'User',
            role: (metadata.role || UserRole.RIDER) as UserRole,
            avatarUrl: metadata.avatar_url,
            vehicleModel: metadata.vehicle_model,
            vehiclePlate: metadata.vehicle_plate,
            rating: metadata.rating
          };
        }
      }

      const user: User = {
        id: session.user.id,
        email: profile.email || session.user.email || '',
        name: profile.name,
        role: profile.role as UserRole,
        avatarUrl: profile.avatar_url,
        vehicleModel: profile.vehicle_model,
        vehiclePlate: profile.vehicle_plate,
        rating: profile.rating
      };

      log.success('Current user loaded', { 
        id: user.id, 
        email: user.email,
        role: user.role 
      });

      return user;
    } catch (error: any) {
      log.error('Get current user error', error);
      return null;
    }
  }

  // Create user profile
  private async createUserProfile(authUser: any): Promise<any | null> {
    try {
      log.info('Creating profile for user', authUser.id);
      
      const metadata = authUser.user_metadata || {};
      
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email: authUser.email,
          name: metadata.name || authUser.email?.split('@')[0] || 'User',
          role: metadata.role || UserRole.RIDER,
          avatar_url: metadata.avatar_url || `https://i.pravatar.cc/150?u=${authUser.email}`
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          log.warn('Profile already exists, fetching...');
          return await this.getUserProfile(authUser.id);
        }
        log.error('Profile creation failed', error);
        return null;
      }

      log.success('Profile created', data);
      return data;
    } catch (error: any) {
      log.error('Create profile exception', error);
      return null;
    }
  }

  // Listen to auth state changes
  onAuthStateChange(callback: (user: User | null) => void) {
    log.info('Setting up auth listener...');
    
    return supabase.auth.onAuthStateChange(async (event, session) => {
      log.info('Auth event:', event);
      
      if (session?.user) {
        const user = await this.getCurrentUser();
        callback(user);
      } else {
        callback(null);
      }
    });
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('users').select('count').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();
