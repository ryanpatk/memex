import { createContext, useContext, useEffect, useState } from "react";
import type { AuthSession } from "@memex/core";
import { repository } from "../data/repository";

type SessionContextValue = {
  session: AuthSession | null;
  /** True after initial session is read from storage (avoids flash on protected routes). */
  authHydrated: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider for this app
export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
};

type Props = { children: React.ReactNode };
export const SessionProvider = ({ children }: Props) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);

  useEffect(() => {
    void repository.auth.getSession().then((s) => {
      setSession(s);
      setAuthHydrated(true);
    });

    const unsubscribe = repository.auth.onAuthStateChange((s) => {
      setSession(s);
      setAuthHydrated(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, authHydrated }}>
      {children}
    </SessionContext.Provider>
  );
};
