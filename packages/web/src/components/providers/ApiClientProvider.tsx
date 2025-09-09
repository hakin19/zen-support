'use client';

import { useEffect } from 'react';

import { apiClient } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';

export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();

    // Set up the auth token provider
    apiClient.setAuthTokenProvider(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || null;
    });
  }, []);

  return <>{children}</>;
}
