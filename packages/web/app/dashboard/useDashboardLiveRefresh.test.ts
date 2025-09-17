import { describe, expect, it, vi } from 'vitest';

import { setupDashboardSubscriptions } from './useDashboardLiveRefresh';

const refreshDevicesMock = vi.fn();
const refreshUsersMock = vi.fn();

describe('setupDashboardSubscriptions', () => {
  it('subscribes to device and user websocket events', () => {
    const handlers: Record<string, (payload: unknown) => void> = {};
    const unsubscribeMock = vi.fn();
    const subscribeMock = vi
      .fn((event: string, callback: (payload: unknown) => void) => {
        handlers[event] = callback;
        return unsubscribeMock;
      })
      .mockName('subscribe');

    const cleanup = setupDashboardSubscriptions(
      subscribeMock,
      refreshDevicesMock,
      refreshUsersMock
    );

    ['device_update', 'device_created', 'device_deleted'].forEach(event => {
      expect(subscribeMock).toHaveBeenCalledWith(event, expect.any(Function));
    });
    ['user_update', 'user_created', 'user_deleted'].forEach(event => {
      expect(subscribeMock).toHaveBeenCalledWith(event, expect.any(Function));
    });

    cleanup();
    expect(unsubscribeMock).toHaveBeenCalledTimes(6);
  });

  it('invokes refresh callbacks when handlers fire', () => {
    const handlers: Record<string, (payload: unknown) => void> = {};
    const subscribeMock = vi.fn(
      (event: string, callback: (payload: unknown) => void) => {
        handlers[event] = callback;
        return undefined;
      }
    );

    setupDashboardSubscriptions(
      subscribeMock,
      refreshDevicesMock,
      refreshUsersMock
    );

    handlers['device_update']?.({ device: { id: 'd1' } });
    handlers['user_update']?.({ user: { id: 'u1' } });

    expect(refreshDevicesMock).toHaveBeenCalledTimes(1);
    expect(refreshUsersMock).toHaveBeenCalledTimes(1);
  });

  it('returns no-op cleanup when subscribe is undefined', () => {
    const cleanup = setupDashboardSubscriptions(
      undefined,
      refreshDevicesMock,
      refreshUsersMock
    );

    expect(cleanup).toBeTypeOf('function');
    cleanup();

    expect(refreshDevicesMock).not.toHaveBeenCalled();
    expect(refreshUsersMock).not.toHaveBeenCalled();
  });
});
