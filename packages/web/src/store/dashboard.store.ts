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
  userMetrics: {
    total: number;
    pendingInvites: number;
  };
  summary: DashboardSummary | null;
  hasLoaded: boolean;
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
  total?: number;
  page?: number;
  limit?: number;
}

const initialState = {
  loading: false,
  error: null,
  organization: null,
  devices: [] as DeviceRecord[],
  users: [] as UserRecord[],
  userMetrics: {
    total: 0,
    pendingInvites: 0,
  },
  summary: null,
  hasLoaded: false,
};

const fallbackOrganization: OrganizationSummary = {
  id: 'dev-org',
  name: 'Development Organization',
  subscription: {
    plan: 'developer',
    seats: 10,
    used_seats: 4,
  },
};

const fallbackDevices: DeviceRecord[] = [
  {
    id: 'device-1',
    name: 'Demo Router',
    status: 'online',
    last_seen: new Date().toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'device-2',
    name: 'Warehouse Sensor',
    status: 'offline',
    last_seen: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

const fallbackUserMetrics = {
  total: 6,
  pendingInvites: 1,
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
  userMetrics: { total: number; pendingInvites: number }
): DashboardSummary {
  const totalDevices = devices.length;
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status !== 'online').length;

  const totalUsers = userMetrics.total;
  const pendingInvites = userMetrics.pendingInvites;

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
  devtools((set, get) => ({
    ...initialState,

    fetchInitial: async (): Promise<void> => {
      const { loading, hasLoaded } = get();
      if (loading || hasLoaded) return;
      set(
        { loading: true, error: null },
        false,
        'dashboard/fetchInitial:start'
      );

      try {
        const [
          orgResponse,
          devicesResponse,
          usersResponse,
          invitedUsersResponse,
        ] = await Promise.all([
          api.get<OrganizationResponse>('/api/organization'),
          api.get<DevicesResponse>('/api/devices'),
          api.get<UsersResponse>('/api/users?page=1&limit=50'),
          // Fetch count of invited users only
          api.get<UsersResponse>('/api/users?page=1&limit=1&status=invited'),
        ]);

        console.log('Dashboard API responses:', {
          orgResponse: orgResponse.data,
          devicesResponse: devicesResponse.data,
          usersResponse: usersResponse.data,
          invitedUsersResponse: invitedUsersResponse.data,
        });

        const organization = orgResponse.data.organization ?? null;
        const devices = devicesResponse.data.devices ?? [];
        const users = usersResponse.data.users ?? [];
        const userMetrics = {
          total: usersResponse.data.total ?? users.length,
          pendingInvites: invitedUsersResponse.data.total ?? 0,
        };

        // If we don't have an organization, use fallback data in development
        if (!organization && process.env.NODE_ENV !== 'production') {
          const summary = buildSummary(
            fallbackOrganization,
            fallbackDevices,
            fallbackUserMetrics
          );

          set(
            {
              organization: fallbackOrganization,
              devices: fallbackDevices,
              users: [],
              userMetrics: fallbackUserMetrics,
              summary,
              loading: false,
              error: null,
            },
            false,
            'dashboard/fetchInitial:fallback'
          );
          return;
        }

        set(
          {
            organization,
            devices,
            users,
            userMetrics,
            summary: buildSummary(organization, devices, userMetrics),
            loading: false,
            error: null,
            hasLoaded: true,
          },
          false,
          'dashboard/fetchInitial:success'
        );
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to load dashboard';

        if (process.env.NODE_ENV !== 'production') {
          const summary = buildSummary(
            fallbackOrganization,
            fallbackDevices,
            fallbackUserMetrics
          );

          set(
            {
              organization: fallbackOrganization,
              devices: fallbackDevices,
              users: [],
              userMetrics: fallbackUserMetrics,
              summary,
              loading: false,
              error: message,
              hasLoaded: true,
            },
            false,
            'dashboard/fetchInitial:fallback'
          );
        } else {
          set(
            { error: message, loading: false, hasLoaded: true },
            false,
            'dashboard/fetchInitial:error'
          );
        }
      }
    },

    refreshDevices: async (): Promise<void> => {
      try {
        const response = await api.get<DevicesResponse>('/api/devices');
        const devices = response.data.devices ?? [];

        set(
          state => ({
            devices,
            summary: buildSummary(
              state.organization,
              devices,
              state.userMetrics
            ),
            error: null,
            hasLoaded: true,
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
        const [usersResponse, invitedUsersResponse] = await Promise.all([
          api.get<UsersResponse>('/api/users?page=1&limit=50'),
          api.get<UsersResponse>('/api/users?page=1&limit=1&status=invited'),
        ]);

        const users = usersResponse.data.users ?? [];
        const userMetrics = {
          total: usersResponse.data.total ?? users.length,
          pendingInvites: invitedUsersResponse.data.total ?? 0,
        };

        set(
          state => ({
            users,
            userMetrics,
            summary: buildSummary(
              state.organization,
              state.devices,
              userMetrics
            ),
            error: null,
            hasLoaded: true,
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
