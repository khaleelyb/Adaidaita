import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../constants';

// In-memory storage adapter to replace localStorage
const memoryStorage = new Map<string, string>();

const inMemoryStorageAdapter = {
  getItem: (key: string): string | null => {
    return memoryStorage.get(key) || null;
  },
  setItem: (key: string, value: string): void => {
    memoryStorage.set(key, value);
  },
  removeItem: (key: string): void => {
    memoryStorage.delete(key);
  }
};

/**
 * SINGLE SOURCE OF TRUTH for Supabase client
 * Used by both auth and the rest of the app
 */
export const supabaseClient = createClient(
  SUPABASE_CONFIG.url, 
  SUPABASE_CONFIG.anonKey, 
  {
    auth: {
      persistSession: true, // It persists in memory, but not on disk
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: inMemoryStorageAdapter, // Use memory instead of localStorage
    }
  }
);

// Export convenience reference
export const supabase = supabaseClient;
