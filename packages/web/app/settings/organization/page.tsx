import React from 'react';

import OrganizationSettingsPageClient from './OrganizationSettingsPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function OrganizationSettingsPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <OrganizationSettingsPageClient />
    </AppLayout>
  );
}
