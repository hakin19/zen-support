import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { api } from '@/lib/api-client';

interface OrganizationSummary {
  id: string;
  name: string;
  subscription?: {
    plan?: string;
    seats?: number;
    used_seats?: number;
  } | null;
}

interface DeviceRecord {
  id: string;
  name?: string | null;
  status?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
}

interface UserRecord {
  id: string;
  role?: string | null;
  status?: string | null;
  email?: string | null;
  created_at?: string | null;
}

export interface DashboardAlert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DashboardActivity {
  id: string;
  message: string;
  timestamp: string;
  type: 'device' | 'user' | 'session';
}

export interface DashboardSummary {
  organizationName: string;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  totalUsers: number;
  pendingInvites: number;
  pendingApprovals: number;
  subscriptionUsage?: {
    used: number;
    total: number;
  } | null;
  alerts: DashboardAlert[];
  recentActivity: DashboardActivity[];
  lastUpdated: string;
}

interface DashboardState {
  loading: boolean;
  error: string | null;
  organization: OrganizationSummary | null;
  devices: DeviceRecord[];
  users: UserRecord[];
  summary: DashboardSummary | null;
  fetchInitial: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  reset: () => void;
}

interface OrganizationResponse {
  organization?: OrganizationSummary | null;
}

interface DevicesResponse {
  devices?: DeviceRecord[] | null;
}

interface UsersResponse {
  users?: UserRecord[] | null;
}

const initialState = {
  loading: false,
  error: null,
  organization: null,
  devices: [] as DeviceRecord[],
  users: [] as UserRecord[],
  summary: null,
};

function computeAlerts(
  offlineDevices: number,
  pendingInvites: number
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (offlineDevices > 0) {
    alerts.push({
      id: 'devices-offline',
      severity: offlineDevices >= 3 ? 'critical' : 'warning',
      message: `${offlineDevices} device${offlineDevices === 1 ? '' : 's'} needs attention`,
    });
  }

  if (pendingInvites > 0) {
    alerts.push({
      id: 'pending-invites',
      severity: 'info',
      message: `${pendingInvites} pending invite${pendingInvites === 1 ? '' : 's'} awaiting action`,
    });
  }

  return alerts;
}

function computeRecentActivity(devices: DeviceRecord[]): DashboardActivity[] {
  return devices
    .slice()
    .sort((a, b) => {
      const aDate = new Date(a.last_seen ?? a.created_at ?? 0).getTime();
      const bDate = new Date(b.last_seen ?? b.created_at ?? 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 5)
    .map(device => ({
      id: `device-${device.id}`,
      type: 'device' as const,
      message: `${device.name ?? 'Device'} is currently ${
        device.status ?? 'unknown'
      }`,
      timestamp: new Date(
        device.last_seen ?? device.created_at ?? Date.now()
      ).toISOString(),
    }));
}

function buildSummary(
  organization: OrganizationSummary | null,
  devices: DeviceRecord[],
  users: UserRecord[]
): DashboardSummary {
  const totalDevices = devices.length;
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status !== 'online').length;

  const totalUsers = users.length;
  const pendingInvites = users.filter(u => u.status === 'invited').length;

  const alerts = computeAlerts(offlineDevices, pendingInvites);
  const recentActivity = computeRecentActivity(devices);

  const subscriptionUsage = organization?.subscription
    ? {
        used: organization.subscription.used_seats ?? totalUsers,
        total: organization.subscription.seats ?? totalUsers,
      }
    : null;

  return {
    organizationName: organization?.name ?? 'Your Organization',
    totalDevices,
    onlineDevices,
    offlineDevices,
    totalUsers,
    pendingInvites,
    pendingApprovals: 0,
    subscriptionUsage,
    alerts,
    recentActivity,
    lastUpdated: new Date().toISOString(),
  };
}

export const useDashboardStore = create<DashboardState>()(
  devtools((set, _get) => ({
    ...initialState,

    fetchInitial: async (): Promise<void> => {
      set(
        { loading: true, error: null },
        false,
        'dashboard/fetchInitial:start'
      );

      try {
        const [orgResponse, devicesResponse, usersResponse] = await Promise.all(
          [
            api.get<OrganizationResponse>('/api/organization'),
            api.get<DevicesResponse>('/api/devices'),
            api.get<UsersResponse>('/api/users?page=1&limit=50'),
          ]
        );

        const organization = orgResponse.data.organization ?? null;
        const devices = devicesResponse.data.devices ?? [];
        const users = usersResponse.data.users ?? [];

        set(
          {
            organization,
            devices,
            users,
            summary: buildSummary(organization, devices, users),
            loading: false,
            error: null,
          },
          false,
          'dashboard/fetchInitial:success'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load dashboard';
        set(
          { error: message, loading: false },
          false,
          'dashboard/fetchInitial:error'
        );
      }
    },

    refreshDevices: async (): Promise<void> => {
      try {
        const response = await api.get<DevicesResponse>('/api/devices');
        const devices = response.data.devices ?? [];

        set(
          state => ({
            devices,
            summary: buildSummary(state.organization, devices, state.users),
            error: null,
          }),
          false,
          'dashboard/refreshDevices:success'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to refresh devices';
        set({ error: message }, false, 'dashboard/refreshDevices:error');
      }
    },

    refreshUsers: async (): Promise<void> => {
      try {
        const response = await api.get<UsersResponse>(
          '/api/users?page=1&limit=50'
        );
        const users = response.data.users ?? [];

        set(
          state => ({
            users,
            summary: buildSummary(state.organization, state.devices, users),
            error: null,
          }),
          false,
          'dashboard/refreshUsers:success'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to refresh users';
        set({ error: message }, false, 'dashboard/refreshUsers:error');
      }
    },

    reset: (): void => set({ ...initialState }, false, 'dashboard/reset'),
  }))
);
