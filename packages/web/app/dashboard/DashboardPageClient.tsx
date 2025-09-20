'use client';

import React, { useEffect, useRef } from 'react';

import { DashboardOverview } from './DashboardOverview';
import { useDashboardLiveRefresh } from './useDashboardLiveRefresh';

import { useAuth } from '@/components/providers/AuthProvider';
import { useDashboardStore } from '@/store/dashboard.store';
import { useWebSocketStore } from '@/store/websocket.store';

export default function DashboardPage(): React.ReactElement {
  const summary = useDashboardStore(state => state.summary);
  const loading = useDashboardStore(state => state.loading);
  const error = useDashboardStore(state => state.error);
  const fetchInitial = useDashboardStore(state => state.fetchInitial);
  const reset = useDashboardStore(state => state.reset);
  const connect = useWebSocketStore(state => state.connect);
  const disconnect = useWebSocketStore(state => state.disconnect);
  const { session, loading: authLoading } = useAuth();
  const hasFetchedRef = useRef(false);
  const hasConnectedRef = useRef(false);

  // Reset the store on mount to allow fresh fetch
  useEffect(() => {
    reset();
    hasFetchedRef.current = false;
  }, [reset]);

  // Fetch initial data only once when auth is ready
  useEffect(() => {
    if (!authLoading && session?.access_token && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void fetchInitial();
    }
    // Only depend on authLoading to avoid re-fetching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Connect to WebSocket once on mount
  useEffect(() => {
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      void connect();
    }
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useDashboardLiveRefresh();

  return (
    <div className='flex-1 p-6'>
      <DashboardOverview summary={summary} loading={loading} error={error} />
    </div>
  );
}
