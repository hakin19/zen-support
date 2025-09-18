'use client';

import React, { type JSX } from 'react';

import { UserManagement } from '@/components/settings/UserManagement';

function UsersPage(): JSX.Element {
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
