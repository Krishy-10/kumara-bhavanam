import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { APP_USERS, type AppUser } from '@/config/users';
import { readLocal, writeLocal } from '@/lib/storage';

const KEY = 'kb.user';

interface UserState {
  /** The name picked on this phone; written to created_by on every insert. */
  user: AppUser | null;
  setUser: (u: AppUser) => void;
  clearUser: () => void;
}

const Ctx = createContext<UserState | null>(null);

function readStored(): AppUser | null {
  const v = readLocal(KEY);
  return (APP_USERS as readonly string[]).includes(v ?? '') ? (v as AppUser) : null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setState] = useState<AppUser | null>(readStored);
  const setUser = useCallback((u: AppUser) => {
    writeLocal(KEY, u);
    setState(u);
  }, []);
  const clearUser = useCallback(() => {
    writeLocal(KEY, null);
    setState(null);
  }, []);
  const value = useMemo(() => ({ user, setUser, clearUser }), [user, setUser, clearUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser(): UserState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUser must be used inside <UserProvider>');
  return v;
}

/** The picked name, for screens that only render after the picker. */
export function useCurrentUser(): AppUser {
  const { user } = useUser();
  if (!user) throw new Error('No user picked');
  return user;
}
