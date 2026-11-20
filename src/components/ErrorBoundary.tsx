/**
 * If a screen hits an unexpected error, React would otherwise clear the whole
 * page to blank. This shows a calm recovery card instead: Reload (a half-typed
 * booking is kept for this tab) or go Home. The error text is shown small, so
 * a screenshot tells us what went wrong.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { DemoBadge } from './Layout';

interface State {
  error: Error | null;
}

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Screen error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A new deploy removes old files; a stale tab then fails to load a screen.
    const stale = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
    return (
      <main className="mx-auto flex min-h-dvh max-w-app flex-col justify-center gap-4 px-6 text-teak" role="alert">
        <div>
          <DemoBadge />
        </div>
        <h1 className="font-display text-[24px] font-bold">{stale ? 'The app has been updated' : 'Something went wrong on this screen'}</h1>
        <p className="text-[16px] text-muted">
          {stale ? 'Reload to get the new version.' : 'Reload to try again. A booking you were typing is kept.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-primary rounded-btn bg-peacock px-6 font-display text-[19px] font-semibold text-white"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="min-h-touch rounded-2xl border border-line-strong bg-white px-5 font-display text-[16px] font-semibold"
        >
          Go to Home
        </button>
        {!stale && <p className="break-words text-[13px] text-muted">Details: {error.message}</p>}
      </main>
    );
  }
}

/** Resets when the route changes, so moving to another screen clears the error. */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
