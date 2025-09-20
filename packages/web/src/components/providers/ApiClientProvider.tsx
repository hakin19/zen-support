'use client';

import React, { useEffect } from 'react';

import { apiClient } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';

export function ApiClientProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    const supabase = createClient();

    // Set up the auth token provider with automatic refresh
    apiClient.setAuthTokenProvider(async () => {
      // Try to get the current session
      let {
        data: { session },
      } = await supabase.auth.getSession();

      // If session exists but might be expired, refresh it
      if (session?.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000);
        const now = new Date();
        // Refresh if expires within 60 seconds
        if (expiresAt.getTime() - now.getTime() < 60000) {
          const refreshResult = await supabase.auth.refreshSession();
          if (!refreshResult.error && refreshResult.data.session) {
            session = refreshResult.data.session;
          }
        }
      }

      return session?.access_token ?? null;
    });
  }, []);

  return <>{children}</>;
}
