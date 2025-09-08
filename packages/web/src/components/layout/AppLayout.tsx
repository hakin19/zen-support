'use client';

import React from 'react';

import { Sidebar } from './Sidebar';

import type { User } from '@aizen/shared/types';

interface AppLayoutProps {
  children: React.ReactNode;
  user: User;
  onSignOut?: () => void;
}

export function AppLayout({ children, user, onSignOut }: AppLayoutProps) {
  return (
    <div className='min-h-screen bg-background'>
      <Sidebar user={user} onSignOut={onSignOut} />
      <div className='main-content'>{children}</div>
    </div>
  );
}
