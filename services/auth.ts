import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';
import { User, UserRole } from '../types';
import { messaging } from '../lib/firebase';

// Use a unique storage key that won't conflict with window.storage
export const SUPABASE_AUTH_STORAGE_KEY = 'sb-adaidaita-auth';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY, // Unique key to avoid conflicts
  }
});

const log = {
  info: (msg: string, data?: any) => console.log(`[Auth] ℹ️ ${msg}`, data || ''),
  error: (msg: string, error?: any) => console.error(`[Auth] ❌ ${msg}`, error || ''),
  success: (msg: string, data?: any) => console.log(`[Auth] ✅ ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[Auth] ⚠️ ${msg}`, data || '')
};

export class AuthService {
  private authStateChangeListeners: ((user: User | null) => void)[] = [];

  /**
   * Synchronously checks if a session exists in localStorage
   * This prevents waiting for async auth checks if we know we are logged out
   */
  public hasSavedSession(): boolean {
    const sessionStr = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    return !!sessionStr;
  }

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

      // Get FCM token for notifications
      let fcmToken: string | null = null;
      try {
        const { getToken } = await import('firebase/messaging');
        fcmToken = await getToken(messaging, {
          vapidKey: 'BBf-LAYrwI1fFZIqaVLHGDGWPjPIwJfhOquGZa3jU9AjXlL6-F5nnQ3kj8wl3_P_oKtDHZP85QZCHaJZFv08cFY'
        });
        log.info('FCM token obtained', { token: fcmToken?.substring(0, 20) + '...' });
      } catch (fcmError) {
        log.warn('FCM token retrieval failed (may be offline)', fcmError);
      }

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
              avatar_url: `https://i.pravatar.cc/150?u=${email}`,
              fcm_token: fcmToken,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
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

      // Get FCM token for notifications
      let fcmToken: string | null = null;
      try {
        const { getToken } = await import('firebase/messaging');
        fcmToken = await getToken(messaging, {
          vapidKey: 'BBf-LAYrwI1fFZIqaVLHGDGWPjPIwJfhOquGZa3jU9AjXlL6-F5nnQ3kj8wl3_P_oKtDHZP85QZCHaJZFv08cFY'
        });
        log.info('FCM token obtained', { token: fcmToken?.substring(0, 20) + '...' });
      } catch (fcmError) {
        log.warn('FCM token retrieval failed (may be offline)', fcmError);
      }

      // Update user info with last login and FCM token
      const { error: updateError } = await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          fcm_token: fcmToken,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.user.id);

      if (updateError) {
        log.warn('Failed to update user login info', updateError);
      } else {
        log.info('User login info updated');
      }

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

      // Clear ONLY Supabase auth storage (not window.storage data)
      this.clearSupabaseAuthStorage();
      
      log.success('Signed out successfully');
    } catch (error: any) {
      log.error('Sign out error', error);
      // Even if there's an error, clear local storage
      this.clearSupabaseAuthStorage();
      throw error;
    }
  }

  /**
   * Safely clears ONLY Supabase auth-related storage
   * Does NOT touch window.storage keys or other localStorage data
   */
  public clearSupabaseAuthStorage() {
    try {
      // Clear the specific Supabase auth key we configured
      localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      
      // Also clear any legacy Supabase keys that might exist
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (
          key.startsWith('sb-') && 
          (key.includes('-auth-token') || key.includes('supabase.auth.token'))
        ) {
          localStorage.removeItem(key);
          log.info('Cleared legacy Supabase key:', key);
        }
      });
      
      log.info('Supabase auth storage cleared');
    } catch (error) {
      log.error('Error clearing auth storage', error);
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
    // 1. Check local storage first (Sync check)
    if (!this.hasSavedSession()) {
      log.info('No local session found - skipping remote check');
      return null;
    }

    try {
      log.info('Getting current user...');
      
      // 2. Race the session check against a timeout
      // This prevents the app from hanging if Supabase is unreachable
      const sessionPromise = this.getSession();
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => {
          log.warn('Session check timed out');
          resolve(null);
        }, 5000)
      );

      const session = await Promise.race([sessionPromise, timeoutPromise]);
      
      if (!session?.user) {
        log.info('No session found (or timed out)');
        // If we had a token but validation failed/timed out, we should probably clear it
        // but let's be careful not to log them out on a flakey network.
        // For now, if it times out, we return null, effectively logging them out in the UI.
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
        // If we get an auth change, we should reload the profile to be safe
        // but avoid infinite loops if fetch fails
        try {
           const user = await this.getCurrentUser();
           this.notifyAuthChange(user);
        } catch (e) {
           log.error('Failed to reload user on auth change', e);
        }
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
