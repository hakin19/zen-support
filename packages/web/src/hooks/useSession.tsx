'use client';

import { createContext, useContext, useState, useEffect } from 'react';

import type { ReactNode, JSX } from 'react';

type UserRole = 'owner' | 'admin' | 'viewer';

interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
}

interface SessionContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }
      const data = (await response.json()) as { user: User };
      setUser(data.user);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSession();
  }, []);

  return (
    <SessionContext.Provider
      value={{ user, loading, error, refetch: fetchSession }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextType {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
