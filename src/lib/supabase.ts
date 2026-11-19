import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isLocalPreview, isSupabaseConfigured } from '@/config/env';

let client: SupabaseClient | null = null;

/**
 * The single Supabase client. Uses only the publishable (anon) key; data is
 * protected by row-level security. The service_role key is never used here.
 *
 * In `npm run dev` with no Supabase project configured, requests go to the
 * in-browser local preview database instead (dev only; see src/dev).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  // `import.meta.env.DEV` is inlined as false in production, so this whole
  // branch and the dynamic import inside it are removed from the bundle.
  if (import.meta.env.DEV && isLocalPreview) {
    client = createClient('http://local-preview.invalid', 'local-preview', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Vite drops this branch, and the import with it, from production builds.
        fetch: (input, init) => import('@/dev/localBackend').then((m) => m.localFetch(input, init)),
      },
    });
    return client;
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in (see SETUP.md).');
  }
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      // Demo mode never signs in; live mode (later) will persist the Google session.
      persistSession: env.mode === 'live',
      autoRefreshToken: env.mode === 'live',
    },
  });
  return client;
}
