'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

import { OrganizationSettings } from '@/components/settings/OrganizationSettings';
import { useAuthStore } from '@/store/auth.store';

export default function OrganizationSettingsPage(): React.ReactElement {
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

  // Render the organization settings once authenticated
  return (
    <div className='container mx-auto py-6 px-4'>
      <OrganizationSettings />
    </div>
  );
}
