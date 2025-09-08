import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { createApp } from '../../server';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';
import { getRedisClient } from '@aizen/shared/utils/redis-client';

// Mock dependencies
vi.mock('@aizen/shared/utils/supabase-client');
vi.mock('@aizen/shared/utils/redis-client');
vi.mock('../../services/command-queue.service', () => ({
  commandQueueService: {
    claimCommands: vi.fn(),
    submitResult: vi.fn(),
    extendVisibility: vi.fn(),
    addCommand: vi.fn(),
    getCommand: vi.fn(),
  },
  startVisibilityCheck: vi.fn(),
  stopVisibilityCheck: vi.fn(),
}));

describe('WebSocket Authentication', () => {
  let fastify: FastifyInstance;
  let wsClient: WebSocket | null = null;
  let wsUrl: string;
  let mockSupabase: any;
  let mockRedis: any;

  beforeEach(async () => {
    // Setup mock Redis
    mockRedis = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      on: vi.fn(),
      publish: vi.fn(),
      quit: vi.fn(),
      duplicate: vi.fn().mockReturnThis(),
    };
    vi.mocked(getRedisClient).mockResolvedValue(mockRedis);

    // Setup mock Supabase
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    };
    vi.mocked(getSupabaseAdminClient).mockReturnValue(mockSupabase);

    // Create and start the server
    fastify = await createApp();
    await fastify.listen({ port: 0, host: 'localhost' });
    const address = fastify.server.address();
    const port = typeof address === 'object' && address ? address.port : 3001;
    wsUrl = `ws://localhost:${port}`;

    // Mock Supabase auth.getUser
    mockSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    });

    // Mock Supabase users table query
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { customer_id: 'test-customer-id' },
            error: null,
          }),
        } as any;
      }
      if (table === 'devices') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'device-1', name: 'Test Device 1', status: 'online' },
              { id: 'device-2', name: 'Test Device 2', status: 'offline' },
            ],
            error: null,
          }),
        } as any;
      }
      return {} as any;
    });
  });

  afterEach(async () => {
    if (wsClient) {
      wsClient.close();
      wsClient = null;
    }
    await fastify.close();
    vi.clearAllMocks();
  });

  it('should authenticate with Authorization header (non-browser clients)', async () => {
    const token = 'test-jwt-token';

    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Wait for connected message
    const connectedMessage = await new Promise(resolve => {
      wsClient!.once('message', data => {
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(connectedMessage).toMatchObject({
      type: 'connected',
      customerId: 'test-customer-id',
    });
  });

  it('should authenticate with query parameter (browser clients)', async () => {
    const token = 'test-jwt-token';

    // Connect with token in query parameter (browser-style)
    wsClient = new WebSocket(
      `${wsUrl}/api/v1/customer/ws?token=${encodeURIComponent(token)}`
    );

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Wait for connected message (should be authenticated immediately)
    const connectedMessage = await new Promise(resolve => {
      wsClient!.once('message', data => {
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(connectedMessage).toMatchObject({
      type: 'connected',
      customerId: 'test-customer-id',
    });
  });

  it('should authenticate with auth message (browser clients without query param)', async () => {
    const token = 'test-jwt-token';

    // Connect without Authorization header or query param
    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`);

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Send auth message
    wsClient.send(
      JSON.stringify({
        type: 'auth',
        token,
      })
    );

    // Wait for auth_success message
    const authSuccessMessage = await new Promise(resolve => {
      wsClient!.once('message', data => {
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(authSuccessMessage).toMatchObject({
      type: 'auth_success',
      customerId: 'test-customer-id',
    });

    // Wait for connected message
    const connectedMessage = await new Promise(resolve => {
      wsClient!.once('message', data => {
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(connectedMessage).toMatchObject({
      type: 'connected',
      customerId: 'test-customer-id',
    });
  });

  it('should reject connection with invalid token in header', async () => {
    const invalidToken = 'invalid-jwt-token';

    // Mock auth failure
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`, {
      headers: {
        Authorization: `Bearer ${invalidToken}`,
      },
    });

    await new Promise<void>(resolve => {
      wsClient!.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Unauthorized');
        resolve();
      });
    });
  });

  it('should reject connection with invalid token in query parameter', async () => {
    const invalidToken = 'invalid-jwt-token';

    // Mock auth failure
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    wsClient = new WebSocket(
      `${wsUrl}/api/v1/customer/ws?token=${encodeURIComponent(invalidToken)}`
    );

    await new Promise<void>(resolve => {
      wsClient!.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Unauthorized');
        resolve();
      });
    });
  });

  it('should reject auth message with invalid token', async () => {
    const invalidToken = 'invalid-jwt-token';

    // Connect without Authorization header
    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`);

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Mock auth failure
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    // Send auth message with invalid token
    wsClient.send(
      JSON.stringify({
        type: 'auth',
        token: invalidToken,
      })
    );

    // Wait for error message and close
    await new Promise<void>(resolve => {
      wsClient!.on('message', data => {
        const message = JSON.parse(data.toString());
        expect(message).toMatchObject({
          type: 'error',
          error: 'Authentication failed',
        });
      });

      wsClient!.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Unauthorized');
        resolve();
      });
    });
  });

  it('should reject messages before authentication', async () => {
    // Connect without Authorization header
    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`);

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Try to send a message without authenticating first
    wsClient.send(
      JSON.stringify({
        type: 'approve_session',
        sessionId: 'test-session',
      })
    );

    // Wait for error message
    const errorMessage = await new Promise(resolve => {
      wsClient!.once('message', data => {
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(errorMessage).toMatchObject({
      type: 'error',
      error: 'Not authenticated. Send auth message first.',
    });
  });

  it('should handle missing token in auth message', async () => {
    // Connect without Authorization header
    wsClient = new WebSocket(`${wsUrl}/api/v1/customer/ws`);

    await new Promise<void>((resolve, reject) => {
      wsClient!.on('open', () => {
        resolve();
      });
      wsClient!.on('error', reject);
    });

    // Send auth message without token
    wsClient.send(
      JSON.stringify({
        type: 'auth',
      })
    );

    // Wait for error message and close
    await new Promise<void>(resolve => {
      wsClient!.on('message', data => {
        const message = JSON.parse(data.toString());
        expect(message).toMatchObject({
          type: 'error',
          error: 'Missing authentication token',
        });
      });

      wsClient!.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Unauthorized');
        resolve();
      });
    });
  });
});
