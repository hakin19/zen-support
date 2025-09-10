import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

vi.mock('@aizen/shared/utils/redis-client');
vi.mock('@aizen/shared/utils/supabase-client');
// Mock chat routes to avoid importing chat.ts (contains unrelated async/await issue)
vi.mock('../../routes/chat', () => ({
  registerChatRoutes: vi.fn(),
}));
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

describe('Device WebSocket', () => {
  let app: FastifyInstance | undefined;
  let ws: WebSocket | null = null;
  let wsUrl: string;

  // Mocks
  let mockRedis: any;
  let mockRedisClient: any;
  let mockSupabase: any;

  beforeEach(async () => {
    const { getRedisClient } = await import('@aizen/shared/utils/redis-client');
    const { getSupabaseAdminClient } = await import(
      '@aizen/shared/utils/supabase-client'
    );

    // Redis mock
    mockRedisClient = {
      get: vi.fn(),
      setEx: vi.fn(),
      set: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    mockRedis = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
      publish: vi.fn(),
      createSubscription: vi
        .fn()
        .mockResolvedValue({ unsubscribe: vi.fn(), disconnect: vi.fn() }),
      createMultiChannelSubscription: vi.fn(),
    };
    vi.mocked(getRedisClient).mockReturnValue(mockRedis);

    // Supabase mock
    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { customer_id: 'cust-1' } }),
      }),
    };
    vi.mocked(getSupabaseAdminClient).mockReturnValue(mockSupabase);

    const { default: fastify } = await import('fastify');
    const { registerWebSocketRoutes } = await import('../../routes/websocket');
    app = fastify({ logger: false });
    await registerWebSocketRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    wsUrl = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (ws) {
      try {
        ws.close();
      } catch {}
      ws = null;
    }
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.clearAllMocks();
  });

  it('authenticates device via X-Device-Session and responds connected', async () => {
    mockRedisClient.get.mockResolvedValueOnce(
      JSON.stringify({ deviceId: 'device-1' })
    );

    ws = new WebSocket(`${wsUrl}/api/v1/device/ws`, {
      headers: { 'X-Device-Session': 'sess-123' },
    });

    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    const firstMessage: any = await new Promise(resolve => {
      ws!.once('message', data => resolve(JSON.parse(data.toString())));
    });

    expect(firstMessage).toMatchObject({
      type: 'connected',
      deviceId: 'device-1',
    });
  });

  it('rejects connection without valid session token', async () => {
    mockRedisClient.get.mockResolvedValueOnce(null);

    ws = new WebSocket(`${wsUrl}/api/v1/device/ws`, {
      headers: { 'X-Device-Session': 'invalid' },
    });

    await new Promise<void>(resolve => {
      ws!.once('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Unauthorized');
        resolve();
      });
    });
  });

  it('handles heartbeat and claim_command messages', async () => {
    mockRedisClient.get.mockResolvedValueOnce(
      JSON.stringify({ deviceId: 'device-2' })
    );

    const { commandQueueService } = await import(
      '../../services/command-queue.service'
    );

    vi.mocked(commandQueueService.claimCommands).mockResolvedValueOnce([
      {
        id: 'cmd-1',
        type: 'ping',
        parameters: {},
        claimToken: 'claim-1',
        visibleUntil: new Date().toISOString(),
      },
    ] as any);

    ws = new WebSocket(`${wsUrl}/api/v1/device/ws`, {
      headers: { 'X-Device-Session': 'sess-456' },
    });

    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    // Read connected
    await new Promise(resolve => ws!.once('message', () => resolve(null)));

    // Send heartbeat
    ws!.send(JSON.stringify({ type: 'heartbeat', requestId: 'h1' }));
    const hbAck: any = await new Promise(resolve => {
      ws!.once('message', data => resolve(JSON.parse(data.toString())));
    });
    expect(hbAck.type).toBe('heartbeat_ack');

    // Claim command
    ws!.send(JSON.stringify({ type: 'claim_command', requestId: 'r1' }));
    const cmdMsg: any = await new Promise(resolve => {
      ws!.once('message', data => resolve(JSON.parse(data.toString())));
    });
    expect(cmdMsg.type).toBe('command');
    expect(cmdMsg.command.id).toBe('cmd-1');
  });

  it('submits command_result and publishes updates', async () => {
    mockRedisClient.get.mockResolvedValueOnce(
      JSON.stringify({ deviceId: 'device-3' })
    );

    const { commandQueueService } = await import(
      '../../services/command-queue.service'
    );

    vi.mocked(commandQueueService.submitResult).mockResolvedValueOnce({
      success: true,
    } as any);

    ws = new WebSocket(`${wsUrl}/api/v1/device/ws`, {
      headers: { 'X-Device-Session': 'sess-789' },
    });

    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    // Skip connected message
    await new Promise(resolve => ws!.once('message', () => resolve(null)));

    // Send command_result
    const executedAt = new Date().toISOString();
    ws!.send(
      JSON.stringify({
        type: 'command_result',
        commandId: 'cmd-2',
        claimToken: 'claim-2',
        status: 'success',
        output: 'ok',
        executedAt,
        duration: 123,
        requestId: 'r2',
      })
    );

    const ack: any = await new Promise(resolve => {
      ws!.once('message', data => resolve(JSON.parse(data.toString())));
    });

    expect(ack).toMatchObject({ type: 'ack' });
    expect(mockRedis.publish).toHaveBeenCalledWith(
      'device:device-3:updates',
      expect.objectContaining({ type: 'command_completed', commandId: 'cmd-2' })
    );
  });

  it('broadcasts device_status offline on disconnect', async () => {
    mockRedisClient.get.mockResolvedValueOnce(
      JSON.stringify({ deviceId: 'device-4' })
    );

    const { getConnectionManager } = await import('../../routes/websocket');
    const mgr = getConnectionManager();
    const spy = vi
      .spyOn(mgr, 'broadcastToCustomer')
      .mockResolvedValueOnce(undefined as any);

    ws = new WebSocket(`${wsUrl}/api/v1/device/ws`, {
      headers: { 'X-Device-Session': 'sess-999' },
    });

    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    // Skip connected
    await new Promise(resolve => ws!.once('message', () => resolve(null)));

    // Close connection to trigger broadcast
    ws!.close();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(spy).toHaveBeenCalled();
    const [customerId, payload] = spy.mock.calls[0] as [string, any];
    expect(customerId).toBe('cust-1');
    expect(payload).toMatchObject({
      type: 'device_status',
      deviceId: 'device-4',
      status: 'offline',
    });
  });
});
