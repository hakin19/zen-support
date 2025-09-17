import React from 'react';
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../test/test-utils';
import { DashboardOverview } from './DashboardOverview';
import type { DashboardSummary } from '@/store/dashboard.store';

describe('DashboardOverview', () => {
  const summary: DashboardSummary = {
    organizationName: 'Acme Networks',
    totalDevices: 3,
    onlineDevices: 2,
    offlineDevices: 1,
    totalUsers: 4,
    pendingInvites: 1,
    pendingApprovals: 0,
    subscriptionUsage: { used: 4, total: 10 },
    alerts: [
      {
        id: 'devices-offline',
        severity: 'warning',
        message: '1 device needs attention',
      },
      {
        id: 'pending-invites',
        severity: 'info',
        message: '1 pending invite awaiting action',
      },
    ],
    recentActivity: [
      {
        id: 'device-1',
        type: 'device',
        message: 'Edge Router came online',
        timestamp: new Date().toISOString(),
      },
    ],
    lastUpdated: new Date().toISOString(),
  };

  it('renders summary metrics and alerts', () => {
    render(
      <DashboardOverview summary={summary} loading={false} error={null} />
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Acme Networks/i)).toBeInTheDocument();
    expect(screen.getByTestId('devices-total')).toHaveTextContent('3');
    expect(screen.getByTestId('devices-online')).toHaveTextContent('2 online');
    expect(screen.getByTestId('devices-offline')).toHaveTextContent(
      '1 offline'
    );
    expect(screen.getByTestId('users-total')).toHaveTextContent('4 users');
    expect(screen.getByTestId('users-pending')).toHaveTextContent(
      '1 pending invite'
    );
    expect(screen.getByTestId('alerts-list').textContent).toContain(
      '1 device needs attention'
    );
  });

  it('shows loading state when summary missing and loading true', () => {
    render(<DashboardOverview summary={null} loading={true} error={null} />);

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('shows error state when summary missing and error provided', () => {
    render(
      <DashboardOverview
        summary={null}
        loading={false}
        error='Something went wrong'
      />
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
