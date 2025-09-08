'use client';

import React from 'react';

import { Sidebar } from './Sidebar';

import type { User } from '@aizen/shared';

interface AppLayoutProps {
  children: React.ReactNode;
  user: User;
  onSignOut?: () => void;
}

export function AppLayout({
  children,
  user,
  onSignOut,
}: AppLayoutProps): React.ReactElement {
  return (
    <div className='min-h-screen bg-background'>
      <Sidebar user={user} onSignOut={onSignOut} />
      <div className='main-content'>{children}</div>
    </div>
  );
}
