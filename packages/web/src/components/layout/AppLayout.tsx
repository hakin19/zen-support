'use client';

import React from 'react';

import { Sidebar } from './Sidebar';

import { useAuth } from '@/components/providers/AuthProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps): React.ReactElement {
  const { user, loading } = useAuth();

  return (
    <div className='flex min-h-screen bg-background'>
      <Sidebar user={user} loading={loading} />
      <main className='main-content flex min-h-screen flex-col bg-background'>
        {children}
      </main>
    </div>
  );
}
