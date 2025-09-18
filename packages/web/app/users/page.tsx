'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { type JSX, useEffect } from 'react';

import { UserManagement } from '@/components/settings/UserManagement';
import { useAuthStore } from '@/store/auth.store';

function UsersPage(): JSX.Element {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuthStore();

  // Redirect to login if not authenticated after hydration
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Show loading state while auth is hydrating
  if (loading) {
    return (
      <div
        className='flex items-center justify-center min-h-screen'
        data-testid='auth-loading'
      >
        <div className='flex items-center gap-2'>
          <RefreshCw className='h-6 w-6 animate-spin' />
          <span className='text-lg'>Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render anything if redirecting to login
  if (!isAuthenticated) {
    return <div />;
  }

  // Render the user management once authenticated
  return (
    <div className='container mx-auto py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>User Administration</h1>
        <p className='text-muted-foreground'>
          Manage team members and their access
        </p>
      </div>
      <UserManagement />
    </div>
  );
}

export default UsersPage;
