import React from 'react';

import SessionsPageClient from './SessionsPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function SessionsPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <SessionsPageClient />
    </AppLayout>
  );
}
