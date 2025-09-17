import { create } from 'zustand';

import { api } from '@/lib/api-client';

export type DeviceStatus = 'online' | 'offline' | 'error' | 'pending';

export interface Device {
  id: string;
  name: string;
  device_code: string;
  status: DeviceStatus;
  last_heartbeat: string | null;
  registered_at: string;
  ip_address: string | null;
  location: string;
  firmware_version: string | null;
  customer_id: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  description?: string;
}

interface DevicesResponse {
  devices: Device[];
  total: number;
  page: number;
  pageSize: number;
}

interface RegisterResponse {
  device: Device;
  activationCode: string;
}

interface WebSocketClient {
  subscribe: (event: string, handler: (data: unknown) => void) => void;
  unsubscribe: (event: string) => void;
  isConnected: boolean;
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
    location: string;
    description?: string;
  }) => Promise<{ activationCode: string }>;
  updateDeviceStatus: (deviceId: string, status: DeviceStatus) => void;
  updateDeviceHeartbeat: (deviceId: string, timestamp: string) => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  deleteDevice: (deviceId: string) => Promise<void>;
  setWebSocketClient: (client: WebSocketClient) => void;
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
      const response = await api.get<DevicesResponse>(
        `/api/devices?page=${page}&pageSize=${get().pageSize}`
      );

      set({
        devices: response.data.devices,
        currentPage: page,
        totalPages: Math.ceil(response.data.total / get().pageSize),
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
      get().addDevice(response.data.device);
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

  addDevice: (device): void => {
    set(state => ({
      devices: [device, ...state.devices],
    }));
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
