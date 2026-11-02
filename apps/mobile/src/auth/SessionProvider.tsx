import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AuthSession } from '@memex/core';
import { queryClient } from '../data/queryClient';
import { repository } from '../data/repository';

/*
 * The signed-in session (web: src/context/SessionContext.tsx). Token refresh
 * runs only while the app is in the foreground; signing out clears cached
 * data so the next account never sees the last one's rows.
 */

interface SessionState {
  session: AuthSession | null;
  ready: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, ready: false });

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SessionState>({ session: null, ready: false });

  useEffect(() => {
    let alive = true;
    repository.auth
      .getSession()
      .then((session) => alive && setState({ session, ready: true }))
      .catch(() => alive && setState({ session: null, ready: true }));
    const unsubscribe = repository.auth.onAuthStateChange((session) => {
      if (!session) queryClient.clear();
      setState({ session, ready: true });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    repository.auth.setAutoRefresh(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (s) => repository.auth.setAutoRefresh(s === 'active'));
    return () => sub.remove();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
};

export const useSession = () => useContext(SessionContext);
