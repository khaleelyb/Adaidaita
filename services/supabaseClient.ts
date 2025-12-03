import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';

// Initialize the real Supabase client
// You can use this to replace the mock service when your database is fully set up
export const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);