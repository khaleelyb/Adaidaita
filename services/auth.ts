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
          if (profileError.code === '23505') {
            log.warn('Profile already exists (likely created by DB trigger). This is fine.');
          } else {
            log.error('Profile creation failed', profileError);
            console.warn('Proceeding despite profile creation error, will attempt recovery on login.');
          }
        } else {
          log.success('User profile created manually', profileData);
        }
      } catch (profileErr: any) {
        log.error('Profile creation exception', profileErr);
      }

      if (authData.session) {
        log.success('Account created and signed in automatically');
        return authData;
      } else {
        log.warn('Email confirmation required');
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

      // Check profile but don't block login if it fails
      // The getCurrentUser call that usually follows will handle the reconstruction
      this.getUserProfile(data.user.id).then(profile => {
         if (!profile) {
            log.warn('Profile missing on login, triggering creation in background');
            this.createUserProfile(data.user);
         }
      });

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
      
      // Attempt to set offline before signing out, if we can
      const user = await this.getCurrentUser();
      if (user && user.role === UserRole.DRIVER) {
         await supabase.from('users').update({ is_online: false }).eq('id', user.id);
      }

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
          return null;
        }
        log.error('Error fetching user profile', error);
        // Return null here to trigger fallback, but log the error
        return null; 
      }

      return data;
    } catch (error) {
      log.error('Get user profile exception', error);
      return null;
    }
  }

  // Get current user with profile
  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await this.getSession();
      
      if (!session?.user) {
        return null;
      }

      // Fetch user profile from DB
      let profile = await this.getUserProfile(session.user.id);
      let isFallback = false;

      if (!profile) {
        log.warn('User profile not found in DB, attempting to create one...');
        profile = await this.createUserProfile(session.user);
        
        if (!profile) {
            log.warn('Profile creation failed or returned null. Using session metadata as fallback.');
            isFallback = true;
        }
      }

      // Construct User object
      // If we have a DB profile, use it.
      // If not (isFallback), reconstruct from Auth Session Metadata.
      
      const metadata = session.user.user_metadata || {};
      
      // Priorities: DB Profile -> Session Metadata -> Defaults
      const userData: User = {
        id: session.user.id,
        email: profile?.email || session.user.email || '',
        name: profile?.name || metadata.name || session.user.email?.split('@')[0] || 'User',
        role: (profile?.role || metadata.role || UserRole.RIDER) as UserRole,
        avatarUrl: profile?.avatar_url || metadata.avatar_url,
        // Driver specific fields
        vehicleModel: profile?.vehicle_model || metadata.vehicle_model,
        vehiclePlate: profile?.vehicle_plate || metadata.vehicle_plate,
        rating: profile?.rating || metadata.rating
      };

      if (isFallback) {
        log.info('Returned fallback user from session metadata', userData);
      } else {
        // log.success('User profile fetched successfully');
      }

      return userData;
    } catch (error: any) {
      log.error('Get current user error', error);
      return null;
    }
  }

  // Create user profile if it doesn't exist
  private async createUserProfile(authUser: any): Promise<any | null> {
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
        if (error.code === '23505') {
          // Race condition: already exists. Fetch it.
          return await this.getUserProfile(authUser.id);
        }
        log.error('Create user profile failed', error);
        return null;
      }

      log.success('User profile created successfully', data);
      return data;
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
        // We use our resilient getCurrentUser here
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
