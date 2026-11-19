import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '@/config/env';

let client: SupabaseClient | null = null;

/**
 * The single Supabase client. Uses only the publishable (anon) key; data is
 * protected by row-level security. The service_role key must never be used
 * in this app.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in (see SETUP.md).');
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        // Demo mode never signs in; live mode (later) will persist the Google session.
        persistSession: env.mode === 'live',
        autoRefreshToken: env.mode === 'live',
      },
    });
  }
  return client;
}
