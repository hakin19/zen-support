// Web test environment setup for DOM-dependent tests
import { vi, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Only run in environments that provide a global object
if (typeof globalThis !== 'undefined') {
  // matchMedia mock
  if (typeof (globalThis as any).matchMedia !== 'function') {
    (globalThis as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // ResizeObserver mock
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  // scrollTo noop
  if (typeof (globalThis as any).scrollTo !== 'function') {
    (globalThis as any).scrollTo = () => {};
  }

  // Mock clipboard API
  if (typeof (globalThis as any).navigator !== 'undefined') {
    Object.defineProperty((globalThis as any).navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
      writable: true,
      configurable: true,
    });
  }

  // Mock Element.prototype.hasPointerCapture for Radix UI
  if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }

  // Mock scrollIntoView for Radix UI Select components
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
}

// Mock WebSocket store to avoid real WS dependencies in unit tests
const defaultWebsocketState = {
  users: [],
  devices: [], // Will be overridden by individual tests
  promptTemplates: [], // Add prompt templates for PromptTemplateEditor
  organization: null,
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  setUsers: vi.fn(),
  setDevices: vi.fn(),
  setPromptTemplates: vi.fn(),
  updatePromptTemplate: vi.fn(),
  addPromptTemplate: vi.fn(),
  removePromptTemplate: vi.fn(),
  setOrganization: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
};

const useWebSocketStoreMock = vi.fn(() => ({ ...defaultWebsocketState }));

vi.mock('@/store/websocket.store', () => ({
  useWebSocketStore: useWebSocketStoreMock,
}));

// Mock useSession hook
vi.mock('@/hooks/useSession', () => ({
  useSession: vi.fn(() => {
    // Import the mock data from test-utils
    // This will be dynamically updated by tests
    return {
      user: {
        id: '1',
        email: 'test@example.com',
        role: 'admin',
        full_name: 'Test User',
      },
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    };
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock auth store
vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: '1',
      email: 'test@example.com',
      role: 'admin',
      full_name: 'Test User',
    },
    session: {},
    organization: {
      id: 'org-1',
      name: 'Test Organization',
    },
    isAuthenticated: true,
    loading: false,
    setUser: vi.fn(),
    setSession: vi.fn(),
    setOrganization: vi.fn(),
    setLoading: vi.fn(),
    clearAuth: vi.fn(),
  })),
}));

// Mock API client
vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    getBlob: vi.fn().mockResolvedValue(new Blob(['test'])),
  },
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: 'user-123',
              email: 'test@example.com',
              app_metadata: {},
              user_metadata: { role: 'admin' },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            },
          },
        },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  })),
}));

// Import React for the mock above
import React from 'react';
