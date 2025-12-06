import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';
import { supabaseClient } from './supabaseClient'; // Reuse the same instance

const supabase = supabaseClient;

const log = {
  info: (msg: string, data?: any) => console.log(`[Auth] ℹ️ ${msg}`, data || ''),
  error: (msg: string, error?: any) => console.error(`[Auth] ❌ ${msg}`, error || ''),
  success: (msg: string, data?: any) => console.log(`[Auth] ✅ ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[Auth] ⚠️ ${msg}`, data || '')
};

export class AuthService {
  private authStateChangeListeners: ((user: User | null) => void)[] = [];

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

      // Create profile - Retrying a few times if needed
      let profileCreated = false;
      let attempts = 0;
      
      while (!profileCreated && attempts < 3) {
        try {
          attempts++;
          const { error: profileError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email: authData.user.email!,
              name,
              role,
              avatar_url: `https://i.pravatar.cc/150?u=${email}`
            });

          if (profileError) {
            if (profileError.code === '23505') {
              // Duplicate means it was created, maybe by a trigger or previous attempt
              profileCreated = true;
            } else {
              log.warn(`Profile creation attempt ${attempts} failed`, profileError);
              await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
            }
          } else {
            profileCreated = true;
          }
        } catch (err) {
           log.warn(`Profile creation exception attempt ${attempts}`, err);
           await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!profileCreated) {
        // Just log error, don't block signup completely, but it is risky
        log.error('Failed to create user profile after 3 attempts');
      }

      return authData;
    } catch (error: any) {
      log.error('Signup error', error);
      throw error;
    }
  }

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

      // Verify profile exists
      setTimeout(() => {
        this.getUserProfile(data.user!.id).then(profile => {
          if (!profile) {
            log.warn('Profile missing after login, creating...');
            this.createUserProfile(data.user!);
          }
        });
      }, 500);

      return data;
    } catch (error: any) {
      log.error('Sign in error', error);
      throw error;
    }
  }

  async signOut() {
    try {
      log.info('Signing out...');
      
      const user = await this.getCurrentUser();
      if (user && user.role === UserRole.DRIVER) {
        await supabase.from('users')
          .update({ is_online: false })
          .eq('id', user.id);
      }

      // Clear local state first
      this.notifyAuthChange(null);

      // Sign out from Supabase
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

  private async getUserProfile(userId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          log.warn('Profile not found for user', userId);
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

  async getCurrentUser(): Promise<User | null> {
    try {
      log.info('Getting current user...');
      
      const session = await this.getSession();
      
      if (!session?.user) {
        log.info('No session found');
        return null;
      }

      let profile = await this.getUserProfile(session.user.id);

      if (!profile) {
        log.warn('Profile missing, attempting creation...');
        profile = await this.createUserProfile(session.user);
        
        if (!profile) {
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

  private notifyAuthChange(user: User | null) {
    this.authStateChangeListeners.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        log.error('Error in auth state listener', error);
      }
    });
  }

  onAuthStateChange(callback: (user: User | null) => void) {
    log.info('Setting up auth listener...');
    
    // Add to listeners
    this.authStateChangeListeners.push(callback);
    
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      log.info('Auth event:', event);
      
      if (event === 'SIGNED_OUT') {
        log.info('User signed out');
        this.notifyAuthChange(null);
        return;
      }
      
      if (session?.user) {
        const user = await this.getCurrentUser();
        this.notifyAuthChange(user);
      } else {
        this.notifyAuthChange(null);
      }
    });

    return authListener;
  }

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
