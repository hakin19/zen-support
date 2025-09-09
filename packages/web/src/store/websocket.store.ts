import { create } from 'zustand';

import { createClient } from '@/lib/supabase/client';
import { WebSocketClient } from '@/lib/websocket-client';

type DeviceStatus = 'online' | 'offline' | 'pending';
type UserRole = 'owner' | 'admin' | 'viewer';
type UserStatus = 'active' | 'invited' | 'suspended';

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

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login: string | null;
  invitation_sent_at?: string;
  invitation_expires_at?: string;
}

interface Organization {
  id: string;
  name: string;
  subdomain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  settings: any;
  subscription: any;
}

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  template: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  version: number;
  tags?: string[];
  description?: string;
}

interface WebSocketState {
  // Connection state
  isConnected: boolean;
  wsClient: WebSocketClient | null;

  // Entity stores
  devices: Device[];
  users: User[];
  organization: Organization | null;
  promptTemplates: PromptTemplate[];

  // Connection management
  connect: () => Promise<void>;
  disconnect: () => void;
  setConnected: (connected: boolean) => void;

  // Device operations
  setDevices: (devices: Device[]) => void;
  updateDevice: (device: Device) => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;

  // User operations
  setUsers: (users: User[]) => void;
  updateUser: (user: User) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;

  // Organization operations
  setOrganization: (organization: Organization) => void;

  // Prompt template operations
  setPromptTemplates: (templates: PromptTemplate[]) => void;
  updatePromptTemplate: (template: PromptTemplate) => void;
  addPromptTemplate: (template: PromptTemplate) => void;
  removePromptTemplate: (templateId: string) => void;

  // Event listeners
  listeners: Map<string, Set<(data: any) => void>>;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  // Initial state
  isConnected: false,
  wsClient: null,
  devices: [],
  users: [],
  organization: null,
  promptTemplates: [],
  listeners: new Map(),

  // Connection management
  connect: async () => {
    const state = get();
    if (state.wsClient?.isConnected()) return;

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error('No access token available for WebSocket connection');
        return;
      }

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL
        ? `${process.env.NEXT_PUBLIC_WS_URL}/ws`
        : 'ws://localhost:3001/ws';

      const wsClient = new WebSocketClient(wsUrl, {
        auth: { token: session.access_token },
        autoConnect: true,
        reconnect: true,
      });

      // Set up event handlers
      wsClient.on('connect', () => {
        set({ isConnected: true });
      });

      wsClient.on('disconnect', () => {
        set({ isConnected: false });
      });

      wsClient.on('message', (data: any) => {
        const state = get();

        // Handle different message types
        switch (data.type) {
          // Device events
          case 'device_update':
            state.updateDevice(data.device);
            break;
          case 'device_added':
            state.addDevice(data.device);
            break;
          case 'device_removed':
            state.removeDevice(data.deviceId);
            break;

          // User events
          case 'user_update':
            state.updateUser(data.user);
            break;
          case 'user_added':
            state.addUser(data.user);
            break;
          case 'user_removed':
            state.removeUser(data.userId);
            break;

          // Organization events
          case 'organization_update':
            state.setOrganization(data.organization);
            break;

          // Prompt template events
          case 'prompt_template_update':
            state.updatePromptTemplate(data.template);
            break;
          case 'prompt_template_created':
            state.addPromptTemplate(data.template);
            break;
          case 'prompt_template_deleted':
            state.removePromptTemplate(data.templateId);
            break;
        }

        // Notify specific listeners
        const listeners = state.listeners.get(data.type);
        if (listeners) {
          listeners.forEach(callback => callback(data));
        }
      });

      wsClient.on('error', (error: any) => {
        console.error('WebSocket error:', error);
      });

      set({ wsClient });
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  },

  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
      set({ wsClient: null, isConnected: false });
    }
  },

  setConnected: connected => set({ isConnected: connected }),

  // Device operations
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

  // User operations
  setUsers: users => set({ users }),
  updateUser: user =>
    set(state => ({
      users: state.users.map(u => (u.id === user.id ? user : u)),
    })),
  addUser: user =>
    set(state => ({
      users: [...state.users, user],
    })),
  removeUser: userId =>
    set(state => ({
      users: state.users.filter(u => u.id !== userId),
    })),

  // Organization operations
  setOrganization: organization => set({ organization }),

  // Prompt template operations
  setPromptTemplates: templates => set({ promptTemplates: templates }),
  updatePromptTemplate: template =>
    set(state => ({
      promptTemplates: state.promptTemplates.map(t =>
        t.id === template.id ? template : t
      ),
    })),
  addPromptTemplate: template =>
    set(state => ({
      promptTemplates: [...state.promptTemplates, template],
    })),
  removePromptTemplate: templateId =>
    set(state => ({
      promptTemplates: state.promptTemplates.filter(t => t.id !== templateId),
    })),

  // Event subscription
  subscribe: (event, callback) => {
    const state = get();
    if (!state.listeners.has(event)) {
      state.listeners.set(event, new Set());
    }
    state.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = state.listeners.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          state.listeners.delete(event);
        }
      }
    };
  },
}));
