'use client';

import { useEffect, useRef } from 'react';

import { useDashboardStore } from '@/store/dashboard.store';
import { useWebSocketStore } from '@/store/websocket.store';

type SubscribeFn = (
  event: string,
  callback: (payload: unknown) => void
) => (() => void) | void;

export function setupDashboardSubscriptions(
  subscribe: SubscribeFn | undefined,
  refreshDevices: () => Promise<void> | void,
  refreshUsers: () => Promise<void> | void
): () => void {
  if (typeof subscribe !== 'function') {
    return () => {};
  }

  const deviceEvents = ['device_update', 'device_created', 'device_deleted'];
  const userEvents = ['user_update', 'user_created', 'user_deleted'];

  const deviceUnsubscribes = deviceEvents.map(event =>
    subscribe(event, () => {
      void refreshDevices();
    })
  );

  const userUnsubscribes = userEvents.map(event =>
    subscribe(event, () => {
      void refreshUsers();
    })
  );

  return () => {
    [...deviceUnsubscribes, ...userUnsubscribes].forEach(unsubscribe => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch {
        // Ignore unsubscribe errors in cleanup
      }
    });
  };
}

export function useDashboardLiveRefresh(): void {
  const refreshDevices = useDashboardStore(state => state.refreshDevices);
  const refreshUsers = useDashboardStore(state => state.refreshUsers);
  const subscribe = useWebSocketStore(state => state.subscribe);

  const refreshDevicesRef = useRef(refreshDevices);
  const refreshUsersRef = useRef(refreshUsers);

  useEffect(() => {
    refreshDevicesRef.current = refreshDevices;
    refreshUsersRef.current = refreshUsers;
  }, [refreshDevices, refreshUsers]);

  useEffect(() => {
    return setupDashboardSubscriptions(
      subscribe,
      () => refreshDevicesRef.current?.(),
      () => refreshUsersRef.current?.()
    );
  }, [subscribe]);
}
