import React from 'react';

import { AppLayout } from '@/components/layout/AppLayout';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function Settings(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <SettingsPage />
    </AppLayout>
  );
}
