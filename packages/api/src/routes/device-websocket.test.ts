import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';

import { createApp } from '../server';
import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';
import { commandQueueService } from '../services/command-queue.service';

import type { FastifyInstance } from 'fastify';

// Mock dependencies
vi.mock('@aizen/shared/utils/redis-client');
vi.mock('@aizen/shared/utils/supabase-client');
vi.mock('../services/command-queue.service', () => ({
  commandQueueService: {
    claimCommands: vi.fn(),
    submitResult: vi.fn(),
    addCommand: vi.fn(),
  },
}));

describe('Device WebSocket Communication', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let mockRedis: any;
  let mockSupabase: any;

  beforeEach(async () => {
    // Setup mock Redis with proper session management
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      on: vi.fn(),
      duplicate: vi.fn().mockReturnThis(),
      createSubscription: vi.fn(),
      disconnect: vi.fn(),
      quit: vi.fn(),
    };
    vi.mocked(getRedisClient).mockReturnValue(mockRedis);

    // Setup mock Supabase
    mockSupabase = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    };
    vi.mocked(getSupabaseAdminClient).mockReturnValue(mockSupabase);

    // Create and start the server
    app = await createApp();
    await app.listen({ port: 0 });
    const address = app.server.address() as { port: number };
    serverUrl = `ws://localhost:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('Device Authentication', () => {
    it('should reject connection without X-Device-Session header', async () => {
      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`);

      await new Promise<void>(resolve => {
        ws.on('close', (code, reason) => {
          expect(code).toBe(1008);
          expect(reason.toString()).toBe('Unauthorized');
          resolve();
        });
      });
    });

    it('should reject connection with invalid session token', async () => {
      // Mock Redis to return null for invalid session
      mockRedis.get.mockResolvedValue(null);

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': 'invalid-session-token',
        },
      });

      await new Promise<void>(resolve => {
        ws.on('close', (code, reason) => {
          expect(code).toBe(1008);
          expect(reason.toString()).toBe('Unauthorized');
          resolve();
        });
      });

      expect(mockRedis.get).toHaveBeenCalledWith(
        'session:invalid-session-token'
      );
    });

    it('should accept connection with valid session token', async () => {
      const sessionToken = 'valid-session-token';
      const deviceId = 'test-device-001';

      // Mock Redis to return valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription
      const subscriptionHandle = {
        unsubscribe: vi.fn(),
      };
      mockRedis.createSubscription.mockResolvedValue(subscriptionHandle);

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('open', resolve);
      });

      // Wait for connected message
      const message = await new Promise(resolve => {
        ws.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(message).toMatchObject({
        type: 'connected',
        deviceId,
      });
      expect(message.timestamp).toBeDefined();
      expect(message.requestId).toBeDefined();

      ws.close();
    });
  });

  describe('Message Handlers', () => {
    let ws: WebSocket;
    const sessionToken = 'valid-session-token';
    const deviceId = 'test-device-001';

    beforeEach(async () => {
      // Setup valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription
      const subscriptionHandle = {
        unsubscribe: vi.fn(),
      };
      mockRedis.createSubscription.mockResolvedValue(subscriptionHandle);

      ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('open', resolve);
      });

      // Consume the connected message
      await new Promise(resolve => {
        ws.once('message', resolve);
      });
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    describe('Heartbeat', () => {
      it('should respond to heartbeat with heartbeat_ack', async () => {
        const requestId = 'heartbeat-123';

        ws.send(
          JSON.stringify({
            type: 'heartbeat',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'heartbeat_ack',
          requestId,
        });
        expect(response.timestamp).toBeDefined();
      });
    });

    describe('Command Claiming', () => {
      it('should return command when available', async () => {
        const requestId = 'claim-123';
        const mockCommand = {
          id: 'cmd-456',
          type: 'network_diagnostic',
          parameters: { test: 'data' },
          claimToken: 'claim-token-789',
          visibleUntil: new Date(Date.now() + 300000).toISOString(),
        };

        vi.mocked(commandQueueService.claimCommands).mockResolvedValue([
          mockCommand,
        ]);

        ws.send(
          JSON.stringify({
            type: 'claim_command',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'command',
          requestId,
          command: {
            id: mockCommand.id,
            type: mockCommand.type,
            parameters: mockCommand.parameters,
            claimToken: mockCommand.claimToken,
            visibleUntil: mockCommand.visibleUntil,
          },
        });

        expect(commandQueueService.claimCommands).toHaveBeenCalledWith(
          deviceId,
          1,
          300000
        );
      });

      it('should return no_commands when queue is empty', async () => {
        const requestId = 'claim-empty-123';

        vi.mocked(commandQueueService.claimCommands).mockResolvedValue([]);

        ws.send(
          JSON.stringify({
            type: 'claim_command',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'no_commands',
          requestId,
        });
      });

      it('should handle command claim errors', async () => {
        const requestId = 'claim-error-123';

        vi.mocked(commandQueueService.claimCommands).mockRejectedValue(
          new Error('Queue service error')
        );

        ws.send(
          JSON.stringify({
            type: 'claim_command',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Failed to claim command',
          requestId,
        });
      });
    });

    describe('Command Results', () => {
      it('should submit command result successfully', async () => {
        const requestId = 'result-123';
        const commandId = 'cmd-789';
        const claimToken = 'claim-token-abc';
        const result = {
          status: 'success',
          output: { data: 'test output' },
          executedAt: new Date().toISOString(),
          duration: 1500,
        };

        vi.mocked(commandQueueService.submitResult).mockResolvedValue({
          success: true,
        });

        ws.send(
          JSON.stringify({
            type: 'command_result',
            commandId,
            claimToken,
            ...result,
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'ack',
          requestId,
        });

        expect(commandQueueService.submitResult).toHaveBeenCalledWith(
          commandId,
          claimToken,
          deviceId,
          expect.objectContaining({
            status: result.status,
            output: result.output,
            executedAt: result.executedAt,
            duration: result.duration,
          })
        );

        // Verify broadcast to device updates channel
        expect(mockRedis.publish).toHaveBeenCalledWith(
          `device:${deviceId}:updates`,
          expect.stringContaining('command_completed')
        );
      });

      it('should handle missing commandId or claimToken', async () => {
        const requestId = 'result-missing-123';

        ws.send(
          JSON.stringify({
            type: 'command_result',
            status: 'success',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Missing commandId or claimToken',
          requestId,
        });
      });

      it('should handle invalid claim token', async () => {
        const requestId = 'result-invalid-123';
        const commandId = 'cmd-789';
        const claimToken = 'invalid-token';

        vi.mocked(commandQueueService.submitResult).mockResolvedValue({
          success: false,
          error: 'INVALID_CLAIM',
        });

        ws.send(
          JSON.stringify({
            type: 'command_result',
            commandId,
            claimToken,
            status: 'success',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Invalid or expired claim token',
          requestId,
        });
      });

      it('should handle already completed command', async () => {
        const requestId = 'result-duplicate-123';
        const commandId = 'cmd-789';
        const claimToken = 'claim-token-abc';

        vi.mocked(commandQueueService.submitResult).mockResolvedValue({
          success: false,
          error: 'ALREADY_COMPLETED',
        });

        ws.send(
          JSON.stringify({
            type: 'command_result',
            commandId,
            claimToken,
            status: 'success',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Command already completed',
          requestId,
        });
      });
    });

    describe('Status Updates', () => {
      it('should store and broadcast device status updates', async () => {
        const status = {
          cpu: 45.5,
          memory: 78.2,
          uptime: 3600,
          network: 'connected',
        };

        ws.send(
          JSON.stringify({
            type: 'status_update',
            status,
          })
        );

        // Give time for async processing
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify status stored in Redis
        expect(mockRedis.set).toHaveBeenCalledWith(
          `device:${deviceId}:status`,
          expect.stringContaining('"cpu":45.5'),
          300
        );

        // Verify broadcast to device updates channel
        expect(mockRedis.publish).toHaveBeenCalledWith(
          `device:${deviceId}:updates`,
          expect.stringContaining('status_update')
        );
      });
    });

    describe('Unknown Message Type', () => {
      it('should return error for unknown message type', async () => {
        const requestId = 'unknown-123';

        ws.send(
          JSON.stringify({
            type: 'unknown_type',
            requestId,
          })
        );

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Unknown message type',
          requestId,
        });
      });
    });

    describe('Invalid Message Format', () => {
      it('should handle invalid JSON', async () => {
        ws.send('invalid json {');

        const response = await new Promise(resolve => {
          ws.once('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });

        expect(response).toMatchObject({
          type: 'error',
          error: 'Invalid message format',
        });
      });
    });
  });

  describe('Connection Management', () => {
    it('should clean up resources on disconnect', async () => {
      const sessionToken = 'valid-session-token';
      const deviceId = 'test-device-001';

      // Setup valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription
      const subscriptionHandle = {
        unsubscribe: vi.fn(),
      };
      mockRedis.createSubscription.mockResolvedValue(subscriptionHandle);

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('open', resolve);
      });

      // Close the connection
      ws.close();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify cleanup
      expect(subscriptionHandle.unsubscribe).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      const sessionToken = 'valid-session-token';
      const deviceId = 'test-device-001';

      // Setup valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription to fail
      mockRedis.createSubscription.mockRejectedValue(
        new Error('Redis connection failed')
      );

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('close', (code, reason) => {
          expect(code).toBe(1011);
          expect(reason.toString()).toBe('Server error');
          resolve();
        });
      });
    });
  });

  describe('Correlation IDs', () => {
    it('should preserve request IDs in responses', async () => {
      const sessionToken = 'valid-session-token';
      const deviceId = 'test-device-001';
      const requestId = 'correlation-test-123';

      // Setup valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription
      const subscriptionHandle = {
        unsubscribe: vi.fn(),
      };
      mockRedis.createSubscription.mockResolvedValue(subscriptionHandle);

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('open', resolve);
      });

      // Consume connected message
      await new Promise(resolve => {
        ws.once('message', resolve);
      });

      // Send message with request ID
      ws.send(
        JSON.stringify({
          type: 'heartbeat',
          requestId,
        })
      );

      const response = await new Promise(resolve => {
        ws.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(response.requestId).toBe(requestId);

      ws.close();
    });

    it('should generate request ID if not provided', async () => {
      const sessionToken = 'valid-session-token';
      const deviceId = 'test-device-001';

      // Setup valid session
      mockRedis.get.mockResolvedValue(JSON.stringify({ deviceId }));

      // Mock Redis subscription
      const subscriptionHandle = {
        unsubscribe: vi.fn(),
      };
      mockRedis.createSubscription.mockResolvedValue(subscriptionHandle);

      const ws = new WebSocket(`${serverUrl}/api/v1/device/ws`, {
        headers: {
          'X-Device-Session': sessionToken,
        },
      });

      await new Promise<void>(resolve => {
        ws.on('open', resolve);
      });

      // Wait for connected message which should have auto-generated requestId
      const message = await new Promise(resolve => {
        ws.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(message.requestId).toBeDefined();
      expect(typeof message.requestId).toBe('string');
      expect(message.requestId.length).toBeGreaterThan(0);

      ws.close();
    });
  });
});
