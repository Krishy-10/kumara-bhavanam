import type { ReactNode } from 'react';
import { env } from '@/config/env';

/**
 * The lock in front of the app. Demo: open. Live (a later version): Google
 * sign-in through Supabase, then a check against allowed_users. The
 * "Who's using this?" picker sits after this gate in both modes, so adding
 * live sign-in here never moves the picker.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  if (env.mode === 'demo') return <>{children}</>;
  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">Kumara Bhavanam</h1>
      <p className="text-muted">Sign-in for the live version isn’t built yet. Set VITE_APP_MODE=demo to use the demo.</p>
    </main>
  );
}
