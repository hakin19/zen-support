import React from 'react';

import UsersPageClient from './UsersPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function UsersPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <UsersPageClient />
    </AppLayout>
  );
}
