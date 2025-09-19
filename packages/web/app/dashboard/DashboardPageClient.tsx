'use client';

import React, { useEffect } from 'react';

import { DashboardOverview } from './DashboardOverview';
import { useDashboardLiveRefresh } from './useDashboardLiveRefresh';

import { useDashboardStore } from '@/store/dashboard.store';
import { useWebSocketStore } from '@/store/websocket.store';

export default function DashboardPage(): React.ReactElement {
  const summary = useDashboardStore(state => state.summary);
  const loading = useDashboardStore(state => state.loading);
  const error = useDashboardStore(state => state.error);
  const fetchInitial = useDashboardStore(state => state.fetchInitial);
  const connect = useWebSocketStore(state => state.connect);
  const disconnect = useWebSocketStore(state => state.disconnect);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // Connect to WebSocket on mount, disconnect on unmount
  useEffect(() => {
    void connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useDashboardLiveRefresh();

  return (
    <div className='flex-1 p-6'>
      <DashboardOverview summary={summary} loading={loading} error={error} />
    </div>
  );
}
