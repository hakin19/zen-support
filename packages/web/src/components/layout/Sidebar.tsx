'use client';

import { MessageCircle, Settings, Menu, X, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

import type { User } from '@aizen/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarProps {
  user: User;
  onSignOut?: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const navigation = [
    {
      name: 'Chat',
      href: '/chat',
      icon: MessageCircle,
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  const toggleSidebar = (): void => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant='ghost'
        size='icon'
        className='fixed top-4 left-4 z-50 lg:hidden'
        onClick={toggleSidebar}
        aria-label='Toggle sidebar'
      >
        {isOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
      </Button>

      {/* Sidebar */}
      <nav
        className={cn('sidebar', !isOpen && 'sidebar-closed')}
        aria-label='Main navigation'
      >
        <div className='flex h-full flex-col'>
          {/* Logo */}
          <div className='flex h-16 items-center px-6 border-b'>
            <h1 className='text-xl font-bold'>Aizen vNE</h1>
          </div>

          {/* Navigation Links */}
          <div className='flex-1 space-y-1 px-3 py-4'>
            {navigation.map(item => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn('nav-link', isActive && 'active')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className='h-5 w-5' />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* User Info & Sign Out */}
          <div className='border-t p-4'>
            <div className='mb-3'>
              <p className='text-sm font-medium'>{user.email ?? 'No email'}</p>
              <p className='text-xs text-muted-foreground capitalize'>
                {user.role ?? 'viewer'}
              </p>
            </div>
            {onSignOut && (
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={onSignOut}
              >
                <LogOut className='mr-2 h-4 w-4' />
                Sign out
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className='fixed inset-0 z-30 bg-black/50 lg:hidden'
          onClick={toggleSidebar}
          aria-hidden='true'
        />
      )}
    </>
  );
}
