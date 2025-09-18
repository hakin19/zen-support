import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateClient,
  mockGetSession,
  setWebSocketClient,
  websocketInstances,
} = vi.hoisted(() => {
  vi.doUnmock('@/lib/supabase/client');
  vi.doUnmock('@/store/device.store');
  vi.doUnmock('@/store/websocket.store');

  const mockGetSession = vi.fn<[], Promise<{ data: { session: { access_token: string | null } | null } }>>();
  const mockCreateClient = vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
    },
  }));

  const setWebSocketClient = vi.fn();
  const websocketInstances: Array<{ url: string; options: Record<string, unknown> }> = [];

  return { mockCreateClient, mockGetSession, setWebSocketClient, websocketInstances };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/store/device.store', () => {
  const state = {
    setWebSocketClient,
  };

  const useDeviceStoreMock = Object.assign(
    (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
    {
      getState: () => state,
    }
  );

  return {
    useDeviceStore: useDeviceStoreMock,
  };
});

vi.mock('@/lib/websocket-client', () => {
  class MockWebSocketClient {
    public on = vi.fn();
    public disconnect = vi.fn();
    constructor(public url: string, public options: Record<string, unknown>) {
      websocketInstances.push({ url, options });
    }
    isConnected(): boolean {
      return false;
    }
  }

  return {
    WebSocketClient: MockWebSocketClient,
  };
});

// Import after mocks so we get the real store module with our test doubles
const { useWebSocketStore } = await import('./websocket.store');

describe('useWebSocketStore.connect', () => {
  beforeEach(() => {
    websocketInstances.length = 0;
    setWebSocketClient.mockReset();
    mockCreateClient.mockClear();
    mockGetSession.mockReset();
  });

  it('connects without auth token when not in production', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await useWebSocketStore.getState().connect();

    expect(mockCreateClient).toHaveBeenCalled();
    expect(websocketInstances).toHaveLength(1);
    const instance = websocketInstances[0];
    expect(instance.url).toBe('ws://localhost:3001/ws');
    expect(instance.options).not.toHaveProperty('auth');
    expect(setWebSocketClient).toHaveBeenCalledTimes(1);
  });
});
