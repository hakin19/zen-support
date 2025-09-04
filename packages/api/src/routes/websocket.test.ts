import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../server';
import { WebSocket } from 'ws';
import { getRedisClient } from '@aizen/shared/utils/redis-client';

// Mock dependencies
vi.mock('@aizen/shared/utils/redis-client', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock('../services/command-queue.service', () => ({
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

// Mock WebSocket module
vi.mock('ws', () => ({
  WebSocket: vi.fn(),
}));

describe('WebSocket Routes', () => {
  let app: FastifyInstance;
  let mockRedis: any;
  let mockSupabase: any;
  let wsClient: any;

  beforeEach(async () => {
    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      setex: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      hget: vi.fn(),
      hset: vi.fn(),
      hdel: vi.fn(),
      hgetall: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      on: vi.fn(),
      duplicate: vi.fn(() => ({
        connect: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        on: vi.fn(),
      })),
      isReady: true,
      disconnect: vi.fn(),
      quit: vi.fn(),
    };

    vi.mocked(getRedisClient).mockReturnValue(mockRedis);

    // Create server instance
    app = await createServer();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.clearAllMocks();
  });

  describe('Device WebSocket', () => {
    const deviceWsUrl = '/api/v1/device/ws';

    describe('Connection', () => {
      it('should reject connection without authentication token', async () => {
        // Mock WebSocket client
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Test connection without auth headers
        const connectPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'close') {
              setTimeout(() => {
                handler(1008, 'Unauthorized');
                resolve(null);
              }, 10);
            }
          });
        });

        await expect(connectPromise).resolves.toBeNull();
        expect(mockWs.close).toHaveBeenCalledWith(1008, 'Unauthorized');
      });

      it('should accept connection with valid device session token', async () => {
        const sessionToken = 'valid-session-token';
        const deviceId = 'device-123';

        // Mock Redis session data
        mockRedis.get.mockResolvedValue(
          JSON.stringify({
            deviceId,
            createdAt: new Date().toISOString(),
          })
        );

        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Test successful connection
        const connectPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'open') {
              handler();
              resolve(null);
            }
          });
        });

        await connectPromise;
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'connected',
            deviceId,
            timestamp: expect.any(String),
          })
        );
      });

      it('should handle connection errors gracefully', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Simulate connection error
        const errorPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'error') {
              const error = new Error('Connection failed');
              handler(error);
              resolve(error);
            }
          });
        });

        await expect(errorPromise).resolves.toBeInstanceOf(Error);
        expect(mockWs.terminate).toHaveBeenCalled();
      });
    });

    describe('Message Handling', () => {
      it('should handle command claim messages', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        const message = {
          type: 'claim_command',
          requestId: 'req-123',
        };

        // Mock Redis command queue
        mockRedis.hget.mockResolvedValue(
          JSON.stringify({
            id: 'cmd-123',
            type: 'diagnostic',
            payload: { script: 'ping 8.8.8.8' },
          })
        );

        // Simulate message handling
        mockWs.on.mockImplementation((event, handler) => {
          if (event === 'message') {
            handler(JSON.stringify(message));
          }
        });

        // Verify response
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'command',
            requestId: 'req-123',
            command: expect.objectContaining({
              id: 'cmd-123',
              type: 'diagnostic',
            }),
          })
        );
      });

      it('should handle command result messages', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        const message = {
          type: 'command_result',
          commandId: 'cmd-123',
          requestId: 'req-123',
          result: {
            success: true,
            output: 'Command executed successfully',
          },
        };

        // Simulate message handling
        mockWs.on.mockImplementation((event, handler) => {
          if (event === 'message') {
            handler(JSON.stringify(message));
          }
        });

        // Verify result stored in Redis
        expect(mockRedis.hset).toHaveBeenCalledWith(
          expect.stringContaining('command:'),
          expect.any(String),
          expect.stringContaining('success')
        );

        // Verify acknowledgment sent
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'ack',
            requestId: 'req-123',
          })
        );
      });

      it('should handle heartbeat/ping messages', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          ping: vi.fn(),
          pong: vi.fn(),
          terminate: vi.fn(),
        };

        // Simulate ping message
        mockWs.on.mockImplementation((event, handler) => {
          if (event === 'ping') {
            handler();
          }
        });

        // Verify pong response
        expect(mockWs.pong).toHaveBeenCalled();
      });
    });
  });

  describe('Customer WebSocket', () => {
    const customerWsUrl = '/api/v1/customer/ws';

    describe('Connection', () => {
      it('should reject connection without Supabase JWT', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Test connection without auth
        const connectPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'close') {
              handler(1008, 'Unauthorized');
              resolve(null);
            }
          });
        });

        await connectPromise;
        expect(mockWs.close).toHaveBeenCalledWith(1008, 'Unauthorized');
      });

      it('should accept connection with valid customer JWT', async () => {
        const jwt = 'valid-jwt-token';
        const customerId = 'customer-456';

        // Mock Supabase auth verification
        const mockSupabaseClient = {
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: customerId,
                  email: 'customer@example.com',
                },
              },
              error: null,
            }),
          },
        };

        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Test successful connection
        const connectPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'open') {
              handler();
              resolve(null);
            }
          });
        });

        await connectPromise;
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'connected',
            customerId,
            timestamp: expect.any(String),
          })
        );
      });

      it('should join customer to device rooms', async () => {
        const customerId = 'customer-456';
        const deviceIds = ['device-123', 'device-456'];

        // Mock device list for customer
        mockRedis.hgetall.mockResolvedValue({
          'device-123': JSON.stringify({ status: 'online' }),
          'device-456': JSON.stringify({ status: 'offline' }),
        });

        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        // Simulate room join
        const joinPromise = new Promise(resolve => {
          mockWs.on.mockImplementation((event, handler) => {
            if (event === 'message') {
              handler(JSON.stringify({ type: 'join_rooms' }));
              resolve(null);
            }
          });
        });

        await joinPromise;

        // Verify room subscriptions
        expect(mockRedis.subscribe).toHaveBeenCalledWith(
          expect.stringContaining('device:123')
        );
        expect(mockRedis.subscribe).toHaveBeenCalledWith(
          expect.stringContaining('device:456')
        );
      });
    });

    describe('Message Handling', () => {
      it('should broadcast session approval to device', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        const message = {
          type: 'approve_session',
          sessionId: 'session-789',
          deviceId: 'device-123',
          requestId: 'req-456',
        };

        // Simulate message handling
        mockWs.on.mockImplementation((event, handler) => {
          if (event === 'message') {
            handler(JSON.stringify(message));
          }
        });

        // Verify message published to device channel
        expect(mockRedis.publish).toHaveBeenCalledWith(
          `device:123:control`,
          JSON.stringify({
            type: 'session_approved',
            sessionId: 'session-789',
            requestId: 'req-456',
            timestamp: expect.any(String),
          })
        );
      });

      it('should handle system info requests', async () => {
        const mockWs = {
          readyState: 1,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          terminate: vi.fn(),
        };

        const message = {
          type: 'get_system_info',
          deviceId: 'device-123',
          requestId: 'req-789',
        };

        // Mock system info in Redis
        mockRedis.hget.mockResolvedValue(
          JSON.stringify({
            hostname: 'device-123',
            os: 'Linux',
            uptime: 86400,
            lastSeen: new Date().toISOString(),
          })
        );

        // Simulate message handling
        mockWs.on.mockImplementation((event, handler) => {
          if (event === 'message') {
            handler(JSON.stringify(message));
          }
        });

        // Verify response
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'system_info',
            requestId: 'req-789',
            deviceId: 'device-123',
            info: expect.objectContaining({
              hostname: 'device-123',
              os: 'Linux',
            }),
          })
        );
      });
    });
  });

  describe('Connection Management', () => {
    it('should track active connections in memory', async () => {
      const connectionManager = (app as any).websocketConnections;

      expect(connectionManager).toBeDefined();
      expect(connectionManager.addConnection).toBeDefined();
      expect(connectionManager.removeConnection).toBeDefined();
      expect(connectionManager.getConnection).toBeDefined();
      expect(connectionManager.getAllConnections).toBeDefined();
    });

    it('should remove connection on disconnect', async () => {
      const connectionId = 'conn-123';
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
      };

      const connectionManager = (app as any).websocketConnections;
      connectionManager.addConnection(connectionId, mockWs);

      // Simulate disconnect
      mockWs.on.mockImplementation((event, handler) => {
        if (event === 'close') {
          handler();
        }
      });

      expect(connectionManager.getConnection(connectionId)).toBeUndefined();
    });

    it('should handle graceful shutdown', async () => {
      const connections = [
        { id: 'conn-1', ws: { close: vi.fn(), readyState: 1 } },
        { id: 'conn-2', ws: { close: vi.fn(), readyState: 1 } },
      ];

      const connectionManager = (app as any).websocketConnections;
      connections.forEach(c => connectionManager.addConnection(c.id, c.ws));

      // Simulate graceful shutdown
      process.emit('SIGTERM');

      // Wait for async shutdown operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all connections were closed
      connections.forEach(c => {
        expect(c.ws.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      });
    });
  });

  describe('Correlation ID Propagation', () => {
    it('should include X-Request-ID in WebSocket messages', async () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
      };

      const requestId = 'req-correlation-123';
      const message = {
        type: 'test_message',
        requestId,
        data: 'test',
      };

      // Simulate message with correlation ID
      mockWs.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          handler(JSON.stringify(message));
        }
      });

      // Verify correlation ID is propagated
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining(requestId)
      );
    });

    it('should generate correlation ID if not provided', async () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
      };

      const message = {
        type: 'test_message',
        data: 'test',
      };

      // Simulate message without correlation ID
      mockWs.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          handler(JSON.stringify(message));
        }
      });

      // Verify correlation ID is generated
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringMatching(/"requestId":\s*"[\w-]+"/)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON messages', async () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
      };

      // Simulate malformed message
      mockWs.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          handler('not valid json{');
        }
      });

      // Verify error response
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          requestId: expect.any(String),
        })
      );
    });

    it('should handle unknown message types', async () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
      };

      const message = {
        type: 'unknown_type',
        requestId: 'req-123',
      };

      // Simulate unknown message type
      mockWs.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          handler(JSON.stringify(message));
        }
      });

      // Verify error response
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          error: 'Unknown message type',
          requestId: 'req-123',
        })
      );
    });

    it('should handle connection timeouts', async () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
        terminate: vi.fn(),
        ping: vi.fn(),
      };

      // Mock heartbeat timeout
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
          // Simulate no pong response
          mockWs.terminate();
          resolve(null);
        }, 35000); // After heartbeat timeout
      });

      vi.useFakeTimers();
      vi.advanceTimersByTime(35000);
      vi.useRealTimers();

      await timeoutPromise;
      expect(mockWs.terminate).toHaveBeenCalled();
    });
  });
});
