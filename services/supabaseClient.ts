import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';

// Single shared instance with persistent session configuration
export const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'adaidaita-auth-token', // Consistent storage key across the app
  }
});
