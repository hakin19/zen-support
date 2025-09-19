import React from 'react';

import DashboardPageClient from './DashboardPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <DashboardPageClient />
    </AppLayout>
  );
}
