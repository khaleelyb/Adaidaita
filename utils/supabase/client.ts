
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../../constants';

// Initialize the real Supabase client for the browser
export const createBrowserClient = () =>
  createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
  );

export const supabase = createBrowserClient();
