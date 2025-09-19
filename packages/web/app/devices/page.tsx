import React from 'react';

import DeviceManagementPageClient from './DeviceManagementPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function DeviceManagementPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <DeviceManagementPageClient />
    </AppLayout>
  );
}
