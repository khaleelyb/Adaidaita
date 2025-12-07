import { createClient } from '@supabase/supabase-js';

// NOTE: This file assumes you have a `constants.ts` file that is correctly 
// importing and exporting environment variables, as required by CRITICAL FIX 16.
// Example content for '../constants' file for reference (not included in final output):
// export const SUPABASE_CONFIG = {
//   url: import.meta.env.VITE_SUPABASE_URL as string,
//   anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string
// };
import { SUPABASE_CONFIG } from '../constants';

/**
 * SINGLE SOURCE OF TRUTH for Supabase client
 * Used by both auth and the rest of the app
 */
export const supabaseClient = createClient(
  SUPABASE_CONFIG.url, // FIX 16: Uses environment variable via SUPABASE_CONFIG
  SUPABASE_CONFIG.anonKey, // FIX 16: Uses environment variable via SUPABASE_CONFIG
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: localStorage // Use standard localStorage for persistence
    }
  }
);

// Export convenience reference
export const supabase = supabaseClient;
