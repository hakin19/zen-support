'use client';

import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState } from 'react';

import type { User } from '@aizen/shared';
import type {
  User as SupabaseUser,
  Session,
  AuthChangeEvent,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOTP: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const mapSupabaseUserToUser = (
    supabaseUser: SupabaseUser | null
  ): User | null => {
    if (!supabaseUser) return null;

    return {
      id: supabaseUser.id,
      email: supabaseUser.email ?? '',
      role: (supabaseUser.user_metadata?.role as User['role']) ?? 'viewer',
      customer_id: (supabaseUser.user_metadata?.customer_id as string) ?? '',
      created_at: supabaseUser.created_at,
      updated_at: supabaseUser.updated_at ?? supabaseUser.created_at,
    };
  };

  useEffect(() => {
    const checkSession = async (): Promise<void> => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
        setUser(mapSupabaseUserToUser(session?.user ?? null));
      } catch {
        // Error checking session
      } finally {
        setLoading(false);
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null): void => {
        setSession(session);
        setUser(mapSupabaseUserToUser(session?.user ?? null));

        if (_event === 'SIGNED_OUT') {
          router.replace('/login');
        }
      }
    );

    return (): void => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  const signIn = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signInWithOTP = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
  };

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    router.replace('/login');
  };

  const refreshSession = async (): Promise<void> => {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(session);
    setUser(mapSupabaseUserToUser(session?.user ?? null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signInWithOTP,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
