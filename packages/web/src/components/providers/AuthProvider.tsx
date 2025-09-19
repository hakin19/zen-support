'use client';

import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState } from 'react';

import type { SignOutScope } from '@/lib/auth/types';
import type { User } from '@aizen/shared';
import type {
  User as SupabaseUser,
  Session,
  AuthChangeEvent,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth.store';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOTP: (email: string) => Promise<void>;
  signOut: (scope?: SignOutScope) => Promise<void>;
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
  const authStore = useAuthStore();

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
        const mappedUser = mapSupabaseUserToUser(session?.user ?? null);
        setUser(mappedUser);

        // Sync with auth store
        if (mappedUser?.email && mappedUser.role) {
          authStore.setUser({
            id: mappedUser.id,
            email: mappedUser.email,
            role: mappedUser.role,
            full_name: undefined,
          });
          authStore.setSession(session as unknown as Record<string, unknown>);
        } else {
          authStore.clearAuth();
        }
      } catch {
        // Error checking session
        authStore.clearAuth();
      } finally {
        setLoading(false);
        authStore.setLoading(false);
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null): void => {
        setSession(session);
        const mappedUser = mapSupabaseUserToUser(session?.user ?? null);
        setUser(mappedUser);

        // Sync with auth store
        if (mappedUser?.email && mappedUser.role) {
          authStore.setUser({
            id: mappedUser.id,
            email: mappedUser.email,
            role: mappedUser.role,
            full_name: undefined,
          });
          authStore.setSession(session as unknown as Record<string, unknown>);
        } else {
          authStore.clearAuth();
        }

        if (_event === 'SIGNED_OUT') {
          router.replace('/login');
        }
      }
    );

    return (): void => {
      subscription.unsubscribe();
    };
  }, [router, supabase, authStore]);

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
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
  };

  const signOut = async (scope: SignOutScope = 'local'): Promise<void> => {
    const response = await fetch('/auth/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ scope }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error ?? 'Failed to sign out');
    }

    setUser(null);
    setSession(null);
    authStore.clearAuth();

    router.replace('/login');
    router.refresh();
  };

  const refreshSession = async (): Promise<void> => {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(session);
    const mappedUser = mapSupabaseUserToUser(session?.user ?? null);
    setUser(mappedUser);

    // Sync with auth store
    if (mappedUser?.email && mappedUser.role) {
      authStore.setUser({
        id: mappedUser.id,
        email: mappedUser.email,
        role: mappedUser.role,
        full_name: undefined,
      });
      authStore.setSession(session as unknown as Record<string, unknown>);
    } else {
      authStore.clearAuth();
    }
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
