import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Enhanced logging helper
const log = {
  info: (msg: string, data?: any) => console.log(`[Auth] ${msg}`, data || ''),
  error: (msg: string, error?: any) => console.error(`[Auth] ❌ ${msg}`, error || ''),
  success: (msg: string, data?: any) => console.log(`[Auth] ✅ ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[Auth] ⚠️ ${msg}`, data || '')
};

export class AuthService {
  // Sign up new user
  async signUp(email: string, password: string, name: string, role: UserRole) {
    try {
      log.info('Starting sign up process...', { email, role });
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
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

      if (authError) {
        log.error('Auth signup failed', authError);
        throw new Error(authError.message);
      }

      if (!authData.user) {
        log.error('No user returned from signup');
        throw new Error('Account creation failed. Please try again.');
      }

      log.success('Auth user created', { id: authData.user.id, email: authData.user.email });

      // Create user profile in public.users table
      // We wrap this in a try-catch to handle race conditions (e.g. if a DB trigger already created it)
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: authData.user.email!,
            name,
            role,
            avatar_url: `https://i.pravatar.cc/150?u=${email}`
          })
          .select()
          .single();

        if (profileError) {
          // Check for duplicate key error (code 23505)
          // This often happens if Supabase has a Trigger that auto-creates the user profile
          if (profileError.code === '23505') {
            log.warn('Profile already exists (likely created by DB trigger). This is fine.');
          } else {
            log.error('Profile creation failed', profileError);
            // We do NOT throw here immediately, because the Auth User was created successfully.
            // If we throw, the user thinks signup failed, but they can't sign up again (email taken).
            // We'll rely on signIn/getCurrentUser to fix/fetch the profile later.
            console.warn('Proceeding despite profile creation error, will attempt recovery on login.');
          }
        } else {
          log.success('User profile created manually', profileData);
        }
      } catch (profileErr: any) {
        log.error('Profile creation exception', profileErr);
        // Swallow exception to allow signup to complete at Auth level
      }

      // Check if email confirmation is required
      if (authData.session) {
        log.success('Account created and signed in automatically');
        return authData;
      } else {
        log.warn('Email confirmation required');
        // If the session is missing, it usually means email confirmation is on.
        // We still return success to the UI so it can show "Check your email".
        return authData;
      }
    } catch (error: any) {
      log.error('Signup error', error);
      throw error;
    }
  }

  // Sign in existing user
  async signIn(email: string, password: string) {
    try {
      log.info('Starting sign in...', { email });
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        log.error('Sign in failed', { code: error.status, message: error.message });
        
        // Provide user-friendly error messages
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password. Please try again.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Please confirm your email before signing in.');
        } else {
          throw new Error(error.message);
        }
      }

      if (!data.user) {
        log.error('No user returned from sign in');
        throw new Error('Sign in failed. Please try again.');
      }

      log.success('Sign in successful', { id: data.user.id, email: data.user.email });

      // Verify user profile exists
      // We wait a moment to ensure any async triggers have fired if this is the first login
      const profile = await this.getUserProfile(data.user.id);
      
      if (!profile) {
        log.warn('User profile not found after sign in, attempting to create one...');
        await this.createUserProfile(data.user);
      }

      return data;
    } catch (error: any) {
      log.error('Sign in error', error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    try {
      log.info('Signing out...');
      const { error } = await supabase.auth.signOut();
      if (error) {
        log.error('Sign out failed', error);
        throw error;
      }
      log.success('Signed out successfully');
    } catch (error: any) {
      log.error('Sign out error', error);
      throw error;
    }
  }

  // Get current session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        log.error('Get session failed', error);
        throw error;
      }
      return session;
    } catch (error: any) {
      log.error('Get session error', error);
      throw error;
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
          log.warn('User profile not found (PGRST116)', { userId });
          return null;
        }
        log.error('Error fetching user profile', error);
        // We throw here because if it's a connection error or RLS error, we need to know.
        // However, for the consumer (getCurrentUser), we might want to be careful.
        throw error;
      }

      return data;
    } catch (error) {
      // If it's the error we threw above, rethrow it? 
      // Or return null to trigger "create profile"? 
      // If it's a network error, creating profile won't work either.
      log.error('Get user profile exception', error);
      return null;
    }
  }

  // Get current user with profile
  async getCurrentUser(): Promise<User | null> {
    try {
      // log.info('Getting current user...');
      
      const session = await this.getSession();
      
      if (!session?.user) {
        // log.info('No active session');
        return null;
      }

      // log.info('Session found', { userId: session.user.id });

      // Fetch user profile
      const profile = await this.getUserProfile(session.user.id);

      if (!profile) {
        log.warn('User profile not found in getCurrentUser, creating one...');
        return await this.createUserProfile(session.user);
      }

      // log.success('User profile fetched successfully');

      return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role as UserRole,
        avatarUrl: profile.avatar_url,
        vehicleModel: profile.vehicle_model,
        vehiclePlate: profile.vehicle_plate,
        rating: profile.rating
      };
    } catch (error: any) {
      log.error('Get current user error', error);
      return null;
    }
  }

  // Create user profile if it doesn't exist
  private async createUserProfile(authUser: any): Promise<User | null> {
    try {
      log.info('Creating user profile...', { userId: authUser.id });
      
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
        // Check if user already exists (race condition)
        if (error.code === '23505') {
          log.warn('User profile already exists (race condition handled)');
          // Try fetching it again
          const existingProfile = await this.getUserProfile(authUser.id);
          if (existingProfile) {
             return {
              id: existingProfile.id,
              email: existingProfile.email,
              name: existingProfile.name,
              role: existingProfile.role as UserRole,
              avatarUrl: existingProfile.avatar_url,
              vehicleModel: existingProfile.vehicle_model,
              vehiclePlate: existingProfile.vehicle_plate,
              rating: existingProfile.rating
            };
          }
        }
        
        log.error('Create user profile failed', error);
        throw new Error(`Failed to create profile: ${error.message}`);
      }

      log.success('User profile created successfully', data);

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
    } catch (error: any) {
      log.error('Create user profile error', error);
      return null;
    }
  }

  // Listen to auth state changes
  onAuthStateChange(callback: (user: User | null) => void) {
    log.info('Setting up auth state listener...');
    
    return supabase.auth.onAuthStateChange(async (event, session) => {
      log.info('Auth state changed', { event, hasSession: !!session });
      
      if (session?.user) {
        // Debounce or slight delay might help if DB triggers are slow
        const user = await this.getCurrentUser();
        callback(user);
      } else {
        callback(null);
      }
    });
  }

  // Test connection to Supabase
  async testConnection(): Promise<boolean> {
    try {
      log.info('Testing Supabase connection...');
      const { data, error } = await supabase.from('users').select('count').limit(1);
      
      if (error) {
        log.error('Connection test failed', error);
        return false;
      }
      
      log.success('Connection test successful');
      return true;
    } catch (error) {
      log.error('Connection test error', error);
      return false;
    }
  }
}

export const authService = new AuthService();
