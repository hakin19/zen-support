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
});
