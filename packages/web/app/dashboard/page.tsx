'use client';

import React, { useEffect } from 'react';

import { DashboardOverview } from './DashboardOverview';
import { useDashboardLiveRefresh } from './useDashboardLiveRefresh';

import { useDashboardStore } from '@/store/dashboard.store';

export default function DashboardPage(): React.ReactElement {
  const summary = useDashboardStore(state => state.summary);
  const loading = useDashboardStore(state => state.loading);
  const error = useDashboardStore(state => state.error);
  const fetchInitial = useDashboardStore(state => state.fetchInitial);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  useDashboardLiveRefresh();

  return (
    <DashboardOverview summary={summary} loading={loading} error={error} />
  );
}
