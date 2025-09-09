'use client';

import { MessageSquare, Settings, Activity } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

export default function HomePage(): React.ReactElement {
  return (
    <div className='flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted'>
      <div className='text-center max-w-4xl px-4'>
        <h1 className='text-5xl font-bold mb-4'>Welcome to Aizen vNE</h1>
        <p className='text-xl text-muted-foreground mb-12'>
          AI-Powered Virtual Network Engineer
        </p>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mt-12'>
          <Link href='/chat' className='group'>
            <div className='p-6 rounded-lg border bg-card hover:shadow-lg transition-all hover:scale-105'>
              <MessageSquare className='w-12 h-12 mb-4 mx-auto text-primary' />
              <h3 className='text-lg font-semibold mb-2'>Support Chat</h3>
              <p className='text-sm text-muted-foreground'>
                Start a support session with AI assistance
              </p>
            </div>
          </Link>

          <Link href='/dashboard' className='group'>
            <div className='p-6 rounded-lg border bg-card hover:shadow-lg transition-all hover:scale-105'>
              <Activity className='w-12 h-12 mb-4 mx-auto text-primary' />
              <h3 className='text-lg font-semibold mb-2'>Dashboard</h3>
              <p className='text-sm text-muted-foreground'>
                Monitor devices and network status
              </p>
            </div>
          </Link>

          <Link href='/settings' className='group'>
            <div className='p-6 rounded-lg border bg-card hover:shadow-lg transition-all hover:scale-105'>
              <Settings className='w-12 h-12 mb-4 mx-auto text-primary' />
              <h3 className='text-lg font-semibold mb-2'>Settings</h3>
              <p className='text-sm text-muted-foreground'>
                Manage users, devices, and organization
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
