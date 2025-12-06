import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';

/**
 * SINGLE SOURCE OF TRUTH for Supabase client
 * Used by both auth and the rest of the app
 */
export const supabaseClient = createClient(
  SUPABASE_CONFIG.url, 
  SUPABASE_CONFIG.anonKey, 
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'sb-adaidaita-auth', // Custom key to avoid conflicts
    }
  }
);

// Export convenience reference
export const supabase = supabaseClient;
