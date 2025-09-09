'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  role: 'viewer' | 'operator' | 'admin' | 'owner' | 'super_admin';
  customer_id: string;
  created_at: string;
  updated_at: string;
}

import { createClient } from '@/lib/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: User['role'];
}

const roleHierarchy: Record<User['role'], number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
  super_admin: 5,
};

export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps): React.ReactElement | null {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          router.replace('/login');
          return;
        }

        const currentUser: User = {
          id: session.user.id,
          email: session.user.email ?? '',
          role: (session.user.user_metadata?.role as User['role']) ?? 'viewer',
          customer_id:
            (session.user.user_metadata?.customer_id as string) ?? '',
          created_at: session.user.created_at,
          updated_at: session.user.updated_at ?? session.user.created_at,
        };

        setUser(currentUser);

        // Check role-based access
        if (requiredRole) {
          const userLevel = roleHierarchy[currentUser.role] ?? 0;
          const requiredLevel = roleHierarchy[requiredRole] ?? 0;

          if (userLevel < requiredLevel) {
            setHasAccess(false);
          } else {
            setHasAccess(true);
          }
        } else {
          setHasAccess(true);
        }
      } catch (err) {
        // Auth check error
        setError(err instanceof Error ? err.message : 'Error loading session');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.replace('/login');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void checkAuth();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router, requiredRole, supabase]);

  // Retry logic for temporary failures
  useEffect(() => {
    if (error?.includes('Network error')) {
      const retryTimeout = setTimeout(() => {
        window.location.reload();
      }, 3000);

      return () => clearTimeout(retryTimeout);
    }
  }, [error]);

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div data-testid='loading-spinner' className='loading-spinner' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='text-center'>
          <p className='text-destructive'>Error loading session</p>
          <p className='text-sm text-muted-foreground mt-2'>{error}</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-destructive'>Access Denied</h1>
          <p className='text-muted-foreground mt-2'>
            You don't have permission to access this page.
          </p>
          <p className='text-sm text-muted-foreground mt-1'>
            Required role: {requiredRole}, Your role: {user?.role}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
