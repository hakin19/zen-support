import { create } from 'zustand';

import { api } from '@/lib/api-client';

export type DeviceStatus = 'online' | 'offline' | 'error' | 'pending';

export interface Device {
  id: string;
  name: string;
  device_id: string;
  status: DeviceStatus;
  last_heartbeat: string | null;
  /**
   * Raw heartbeat timestamp from Supabase. Some API responses still expose
   * `last_heartbeat_at`, so we preserve it for compatibility and hydrate the
   * UI using whichever value is available.
   */
  last_heartbeat_at?: string | null;
  registered_at: string;
  ip_address: string | null;
  location: string;
  firmware_version: string | null;
  customer_id: string;
  created_at: string;
  updated_at: string;
  last_seen?: string | null;
  error_message?: string;
  description?: string;
}

type DeviceUpdate = Partial<Device> & { id: string };

const normalizeDevice = (device: DeviceUpdate, existing?: Device): Device => {
  const merged = { ...(existing ?? {}), ...device } as Device;

  const lastHeartbeat =
    device.last_heartbeat ??
    device.last_heartbeat_at ??
    existing?.last_heartbeat ??
    existing?.last_heartbeat_at ??
    null;

  const lastHeartbeatAt =
    device.last_heartbeat_at ??
    device.last_heartbeat ??
    existing?.last_heartbeat_at ??
    existing?.last_heartbeat ??
    null;

  return {
    ...merged,
    last_heartbeat: lastHeartbeat,
    last_heartbeat_at: lastHeartbeatAt,
  };
};

interface DevicesResponse {
  devices: Device[];
  total: number;
  page: number;
  pageSize?: number;
  limit?: number;
}

interface RegisterResponse {
  device: Device;
  activationCode: string;
}

interface WebSocketClient {
  subscribe: (event: string, handler: (data: unknown) => void) => void;
  unsubscribe: (event: string) => void;
  isConnected: () => boolean;
}

interface DeviceState {
  devices: Device[];
  loading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  webSocketClient?: WebSocketClient;

  // Actions
  fetchDevices: (options?: { page?: number }) => Promise<void>;
  refreshDevices: () => Promise<void>;
  registerDevice: (data: {
    name: string;
    serial_number: string;
    location: string;
    description?: string;
  }) => Promise<{ activationCode: string }>;
  updateDeviceStatus: (deviceId: string, status: DeviceStatus) => void;
  updateDeviceHeartbeat: (deviceId: string, timestamp: string) => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  deleteDevice: (deviceId: string) => Promise<void>;
  setWebSocketClient: (client: WebSocketClient | undefined) => void;
  upsertDevice: (device: DeviceUpdate) => void;
  reset: () => void;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  loading: false,
  error: null,
  currentPage: 1,
  totalPages: 1,
  pageSize: 10,
  webSocketClient: undefined,

  fetchDevices: async (options = {}): Promise<void> => {
    const page = options.page ?? get().currentPage;
    set({ loading: true, error: null });

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(get().pageSize),
      });
      const response = await api.get<DevicesResponse>(
        `/api/devices?${params.toString()}`,
        {}
      );

      const pageSize =
        response.data.pageSize ?? response.data.limit ?? get().pageSize;

      set({
        devices: response.data.devices.map(device => normalizeDevice(device)),
        currentPage: page,
        totalPages: Math.max(
          1,
          Math.ceil((response.data.total || 0) / pageSize)
        ),
        loading: false,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load devices';
      set({
        error: errorMessage,
        loading: false,
      });
    }
  },

  refreshDevices: async (): Promise<void> => {
    await get().fetchDevices({ page: get().currentPage });
  },

  registerDevice: async (data): Promise<{ activationCode: string }> => {
    const response = await api.post<RegisterResponse>(
      '/api/devices/register',
      data
    );

    if (response.data.device) {
      get().upsertDevice(response.data.device);
    }

    return { activationCode: response.data.activationCode };
  },

  updateDeviceStatus: (deviceId, status): void => {
    set(state => ({
      devices: state.devices.map(device =>
        device.id === deviceId ? { ...device, status } : device
      ),
    }));
  },

  updateDeviceHeartbeat: (deviceId, timestamp): void => {
    set(state => ({
      devices: state.devices.map(device =>
        device.id === deviceId
          ? { ...device, last_heartbeat: timestamp }
          : device
      ),
    }));
  },

  addDevice: device => {
    get().upsertDevice(device);
  },

  removeDevice: (deviceId): void => {
    set(state => ({
      devices: state.devices.filter(d => d.id !== deviceId),
    }));
  },

  deleteDevice: async (deviceId): Promise<void> => {
    await api.delete(`/api/devices/${deviceId}`);
    get().removeDevice(deviceId);
  },

  setWebSocketClient: (client): void => {
    set({ webSocketClient: client });
  },

  upsertDevice: device => {
    set(state => {
      const devices = state.devices.some(d => d.id === device.id)
        ? state.devices.map(existing =>
            existing.id === device.id
              ? normalizeDevice(device, existing)
              : existing
          )
        : [normalizeDevice(device), ...state.devices];

      return { devices };
    });
  },

  reset: (): void => {
    set({
      devices: [],
      loading: false,
      error: null,
      currentPage: 1,
      totalPages: 1,
      webSocketClient: undefined,
    });
  },
}));
