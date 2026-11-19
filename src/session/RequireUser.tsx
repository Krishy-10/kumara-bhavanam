import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useUser } from './UserContext';

/** Sends anyone who hasn't picked a name to "Who's using this?" first. */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const location = useLocation();
  if (!user) return <Navigate to="/who" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
