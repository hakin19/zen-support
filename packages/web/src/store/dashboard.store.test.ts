import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api-client';
import { useDashboardStore } from './dashboard.store';

describe('dashboard.store', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    useDashboardStore.getState().reset();
  });

  it('fetchInitial populates summary counts and alerts', async () => {
    const devices = [
      {
        id: 'd1',
        status: 'online',
        name: 'Device 1',
        last_seen: new Date().toISOString(),
      },
      { id: 'd2', status: 'offline', name: 'Device 2', last_seen: null },
      {
        id: 'd3',
        status: 'online',
        name: 'Device 3',
        last_seen: new Date().toISOString(),
      },
    ];

    const users = [
      { id: 'u1', status: 'active', role: 'owner', email: 'owner@example.com' },
      {
        id: 'u2',
        status: 'invited',
        role: 'admin',
        email: 'admin@example.com',
      },
    ];

    vi.mocked(api.get).mockImplementation(async path => {
      if (path === '/api/organization') {
        return {
          data: {
            organization: {
              id: 'org-1',
              name: 'Acme Networks',
              subscription: { plan: 'pro', seats: 10, used_seats: 3 },
            },
          },
        } as { data: unknown };
      }
      if (path === '/api/devices') {
        return {
          data: { devices },
        } as { data: unknown };
      }
      if (path.includes('status=invited')) {
        // Return count of invited users only
        const invitedUsers = users.filter(u => u.status === 'invited');
        return {
          data: {
            users: invitedUsers,
            total: invitedUsers.length,
            page: 1,
            limit: 1,
          },
        } as { data: unknown };
      }
      if (path.startsWith('/api/users')) {
        return {
          data: { users, total: users.length, page: 1, limit: 50 },
        } as { data: unknown };
      }
      throw new Error(`Unexpected path ${path}`);
    });

    await useDashboardStore.getState().fetchInitial();

    const { summary } = useDashboardStore.getState();
    expect(summary).not.toBeNull();
    expect(summary?.organizationName).toBe('Acme Networks');
    expect(summary?.totalDevices).toBe(3);
    expect(summary?.onlineDevices).toBe(2);
    expect(summary?.offlineDevices).toBe(1);
    expect(summary?.totalUsers).toBe(2);
    expect(summary?.pendingInvites).toBe(1);
    expect(summary?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'devices-offline' }),
        expect.objectContaining({ id: 'pending-invites' }),
      ])
    );
  });

  it('refreshDevices updates summary counts when fleet changes', async () => {
    const initialDevices = [
      { id: 'd1', status: 'offline', name: 'Edge 1', last_seen: null },
      {
        id: 'd2',
        status: 'online',
        name: 'Edge 2',
        last_seen: new Date().toISOString(),
      },
    ];

    const updatedDevices = [
      {
        id: 'd1',
        status: 'online',
        name: 'Edge 1',
        last_seen: new Date().toISOString(),
      },
      {
        id: 'd2',
        status: 'online',
        name: 'Edge 2',
        last_seen: new Date().toISOString(),
      },
    ];

    const users = [
      { id: 'u1', status: 'active', role: 'owner', email: 'owner@example.com' },
    ];

    let devicesCallCount = 0;

    vi.mocked(api.get).mockImplementation(async path => {
      if (path === '/api/organization') {
        return {
          data: { organization: { id: 'org-1', name: 'Acme Networks' } },
        } as { data: unknown };
      }
      if (path === '/api/devices') {
        devicesCallCount += 1;
        return {
          data: {
            devices: devicesCallCount === 1 ? initialDevices : updatedDevices,
          },
        } as { data: unknown };
      }
      if (path.includes('status=invited')) {
        // No invited users in this test
        return {
          data: { users: [], total: 0, page: 1, limit: 1 },
        } as { data: unknown };
      }
      if (path.startsWith('/api/users')) {
        return {
          data: { users, total: users.length, page: 1, limit: 50 },
        } as { data: unknown };
      }
      throw new Error(`Unexpected path ${path}`);
    });

    await useDashboardStore.getState().fetchInitial();

    expect(useDashboardStore.getState().summary?.offlineDevices).toBe(1);

    await useDashboardStore.getState().refreshDevices();

    expect(useDashboardStore.getState().summary?.offlineDevices).toBe(0);
  });

  it('handles pagination correctly when there are more than 50 users', async () => {
    // Simulate a response where there are 75 total users but only 50 returned
    const first50Users = Array.from({ length: 50 }, (_, i) => ({
      id: `user-${i + 1}`,
      status: i < 45 ? 'active' : 'invited', // 5 invited users in first page
      role: 'viewer',
      email: `user${i + 1}@example.com`,
    }));

    vi.mocked(api.get).mockImplementation(async path => {
      if (path === '/api/organization') {
        return {
          data: {
            organization: {
              id: 'org-1',
              name: 'Large Corp',
              subscription: { plan: 'enterprise', seats: 100, used_seats: 75 },
            },
          },
        } as { data: unknown };
      }
      if (path === '/api/devices') {
        return {
          data: { devices: [] },
        } as { data: unknown };
      }
      if (path.includes('status=invited')) {
        // Total of 12 invited users across all pages
        return {
          data: { users: [], total: 12, page: 1, limit: 1 },
        } as { data: unknown };
      }
      if (path.startsWith('/api/users')) {
        // Return first 50 users but total is 75
        return {
          data: { users: first50Users, total: 75, page: 1, limit: 50 },
        } as { data: unknown };
      }
      throw new Error(`Unexpected path ${path}`);
    });

    await useDashboardStore.getState().fetchInitial();

    const { summary, userMetrics } = useDashboardStore.getState();

    // Verify that we use the total from API, not the array length
    expect(summary?.totalUsers).toBe(75); // Not 50
    expect(summary?.pendingInvites).toBe(12); // Total from API, not just first page

    // Verify userMetrics are stored correctly
    expect(userMetrics.total).toBe(75);
    expect(userMetrics.pendingInvites).toBe(12);

    // Verify subscription usage still works
    expect(summary?.subscriptionUsage?.used).toBe(75);
    expect(summary?.subscriptionUsage?.total).toBe(100);

    // Verify alert is generated for pending invites
    expect(summary?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pending-invites',
          message: '12 pending invites awaiting action',
        }),
      ])
    );
  });
});
