import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Server,
  Users,
} from 'lucide-react';
import React from 'react';

import type { DashboardAlert, DashboardSummary } from '@/store/dashboard.store';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface DashboardOverviewProps {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
}

function AlertIcon({
  severity,
}: {
  severity: DashboardAlert['severity'];
}): React.ReactElement {
  if (severity === 'critical') {
    return <AlertTriangle className='h-4 w-4 text-destructive' />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className='h-4 w-4 text-amber-500' />;
  }
  return <CheckCircle2 className='h-4 w-4 text-emerald-500' />;
}

function AlertsList({
  alerts,
}: {
  alerts: DashboardAlert[];
}): React.ReactElement {
  if (!alerts.length) {
    return (
      <p data-testid='alerts-list' className='text-sm text-muted-foreground'>
        All systems operating normally.
      </p>
    );
  }

  return (
    <ul className='space-y-3' data-testid='alerts-list'>
      {alerts.map(alert => (
        <li
          key={alert.id}
          data-testid='alert-item'
          className='flex items-start gap-3 rounded-md border border-border/60 bg-card/40 p-3'
        >
          <AlertIcon severity={alert.severity} />
          <span className='text-sm leading-snug'>{alert.message}</span>
        </li>
      ))}
    </ul>
  );
}

function ActivityList({
  summary,
}: {
  summary: DashboardSummary;
}): React.ReactElement {
  if (!summary.recentActivity.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        Activity will appear here once your fleet begins reporting in.
      </p>
    );
  }

  return (
    <ul className='space-y-3' data-testid='activity-list'>
      {summary.recentActivity.map(activity => (
        <li
          key={activity.id}
          data-testid='activity-item'
          className='rounded-md border border-border/60 bg-card/40 p-3'
        >
          <div className='flex items-center justify-between'>
            <p className='text-sm font-medium'>{activity.message}</p>
            <time
              dateTime={activity.timestamp}
              className='text-xs text-muted-foreground'
            >
              {new Date(activity.timestamp).toLocaleString()}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardOverview({
  summary,
  loading,
  error,
}: DashboardOverviewProps): React.ReactElement {
  if (loading && !summary) {
    return (
      <div
        className='flex h-full items-center justify-center'
        data-testid='dashboard-loading'
      >
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2'>
        <AlertTriangle className='h-6 w-6 text-destructive' />
        <p className='text-sm text-destructive'>{error}</p>
      </div>
    );
  }

  if (!summary) {
    return <div className='p-8'>No dashboard data available yet.</div>;
  }

  const { alerts } = summary;

  return (
    <div className='space-y-8 p-6 md:p-8' data-testid='dashboard-view'>
      <header className='space-y-1'>
        <h1 className='text-3xl font-semibold tracking-tight'>Dashboard</h1>
        <p className='text-muted-foreground'>
          Overview for {summary.organizationName}
        </p>
      </header>

      {error && (
        <div className='rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'>
          {error}
        </div>
      )}

      <section className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base font-semibold'>
              <Server className='h-4 w-4' /> Devices
            </CardTitle>
            <CardDescription>Connected fleet overview</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='text-3xl font-semibold' data-testid='devices-total'>
              {summary.totalDevices}
            </div>
            <div className='flex items-center gap-4 text-sm text-muted-foreground'>
              <span data-testid='devices-online'>
                {summary.onlineDevices} online
              </span>
              <span data-testid='devices-offline'>
                {summary.offlineDevices} offline
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base font-semibold'>
              <Users className='h-4 w-4' /> Users
            </CardTitle>
            <CardDescription>Access across your organization</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='text-3xl font-semibold' data-testid='users-total'>
              {summary.totalUsers} users
            </div>
            <div className='text-sm text-muted-foreground'>
              <span data-testid='users-pending'>
                {summary.pendingInvites} pending invite
                {summary.pendingInvites === 1 ? '' : 's'}
              </span>
            </div>
            {summary.subscriptionUsage && (
              <Badge variant='outline' className='w-fit'>
                {summary.subscriptionUsage.used} /{' '}
                {summary.subscriptionUsage.total} seats used
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base font-semibold'>Approvals</CardTitle>
            <CardDescription>Queued actions requiring review</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div
              className='text-3xl font-semibold'
              data-testid='approvals-pending'
            >
              {summary.pendingApprovals}
            </div>
            <div className='text-sm text-muted-foreground'>
              Pending approvals
            </div>
            <Badge variant='secondary'>Real-time updates enabled</Badge>
          </CardContent>
        </Card>
      </section>

      <section className='grid gap-6 lg:grid-cols-2'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>Alerts</h2>
            <Badge variant='outline'>Live</Badge>
          </div>
          <AlertsList alerts={alerts} />
        </div>
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>Recent activity</h2>
            <span className='text-xs text-muted-foreground'>
              Updated {new Date(summary.lastUpdated).toLocaleTimeString()}
            </span>
          </div>
          <ActivityList summary={summary} />
        </div>
      </section>

      <Separator />

      <footer className='text-xs text-muted-foreground'>
        Data refreshes automatically from live WebSocket events.
      </footer>
    </div>
  );
}
