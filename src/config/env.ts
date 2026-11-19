/**
 * The only place that reads import.meta.env. Every value here ends up in the
 * public bundle, so only public values are allowed: the app mode, the Supabase
 * URL and the publishable (anon) key. Never add a secret here.
 */
export type AppMode = 'demo' | 'live';

function readMode(raw: string | undefined): AppMode {
  return raw === 'live' ? 'live' : 'demo';
}

export const env = {
  mode: readMode(import.meta.env.VITE_APP_MODE),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
} as const;

export const isDemo = env.mode === 'demo';

/** True when .env.local has been filled in. */
export const isSupabaseConfigured =
  /^https:\/\/.+/.test(env.supabaseUrl) &&
  env.supabaseAnonKey.length > 20 &&
  !env.supabaseAnonKey.startsWith('YOUR-');
