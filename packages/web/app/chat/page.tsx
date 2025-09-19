import React from 'react';

import ChatPageClient from './ChatPageClient';

import { AppLayout } from '@/components/layout/AppLayout';
import { requireServerUser } from '@/lib/auth/require-server-user';

export default async function ChatPage(): Promise<React.JSX.Element> {
  await requireServerUser();

  return (
    <AppLayout>
      <ChatPageClient />
    </AppLayout>
  );
}
