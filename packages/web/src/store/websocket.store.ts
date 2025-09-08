import { create } from 'zustand';

type DeviceStatus = 'online' | 'offline' | 'pending';

interface Device {
  id: string;
  name: string;
  serial_number: string;
  model: string;
  status: DeviceStatus;
  last_seen: string | null;
  ip_address: string | null;
  location: string | null;
  registered_at: string;
  firmware_version: string | null;
  capabilities: string[];
}

interface WebSocketState {
  isConnected: boolean;
  devices: Device[];
  setConnected: (connected: boolean) => void;
  setDevices: (devices: Device[]) => void;
  updateDevice: (device: Device) => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
}

export const useWebSocketStore = create<WebSocketState>(set => ({
  isConnected: false,
  devices: [],
  setConnected: connected => set({ isConnected: connected }),
  setDevices: devices => set({ devices }),
  updateDevice: device =>
    set(state => ({
      devices: state.devices.map(d => (d.id === device.id ? device : d)),
    })),
  addDevice: device =>
    set(state => ({
      devices: [...state.devices, device],
    })),
  removeDevice: deviceId =>
    set(state => ({
      devices: state.devices.filter(d => d.id !== deviceId),
    })),
}));
