import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerCustomerSessionRoutes } from './customer-sessions';
import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';

// Mock dependencies
vi.mock('../middleware/customer-auth.middleware');

// Mock Supabase client
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
  getAuthenticatedSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

describe('Customer Session Routes', () => {
  let app: FastifyInstance;
  let mockSupabase: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = fastify({
      logger: false,
    });

    // Setup mock middleware to pass through
    vi.mocked(customerAuthMiddleware).mockImplementation(
      async (request, reply) => {
        request.customerId = 'test-customer-123';
        request.userId = 'test-user-456';
        request.customerEmail = 'customer@example.com';
      }
    );

    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(),
    };

    const { getSupabaseAdminClient, getAuthenticatedSupabaseClient } =
      vi.mocked(await import('@aizen/shared/utils/supabase-client'));
    getSupabaseAdminClient.mockReturnValue(mockSupabase);
    getAuthenticatedSupabaseClient.mockReturnValue(mockSupabase);

    // Register routes
    registerCustomerSessionRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/customer/sessions', () => {
    it('should create a diagnostic session for owned device', async () => {
      // Mock device ownership check
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'device-001',
                      customer_id: 'test-customer-123',
                      status: 'online',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'diagnostic_sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'session-123',
                    device_id: 'device-001',
                    customer_id: 'test-customer-123',
                    status: 'active',
                    created_at: '2025-01-04T10:00:00Z',
                    expires_at: '2025-01-04T11:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'device-001',
          reason: 'Network connectivity issues',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session).toMatchObject({
        id: 'session-123',
        deviceId: 'device-001',
        status: 'active',
        createdAt: '2025-01-04T10:00:00Z',
        expiresAt: '2025-01-04T11:00:00Z',
      });
    });

    it('should reject session creation for non-owned device', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'other-device',
          reason: 'Troubleshooting',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Device not owned by customer');
    });

    it('should reject session if device is offline', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'device-001',
                      customer_id: 'test-customer-123',
                      status: 'offline',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'device-001',
          reason: 'Emergency support',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('DEVICE_OFFLINE');
      expect(body.error.message).toBe('Device is not currently online');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/customer/sessions/:id', () => {
    it('should retrieve session details with commands', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      device_id: 'device-001',
                      customer_id: 'test-customer-123',
                      status: 'active',
                      created_at: '2025-01-04T10:00:00Z',
                      commands: [
                        {
                          id: 'cmd-1',
                          type: 'ping',
                          status: 'completed',
                          result: { success: true },
                        },
                        {
                          id: 'cmd-2',
                          type: 'traceroute',
                          status: 'pending',
                        },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/sessions/session-123',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session).toMatchObject({
        id: 'session-123',
        status: 'active',
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: 'cmd-1',
            type: 'ping',
            status: 'completed',
          }),
        ]),
      });
    });

    it('should return 404 for non-existent session', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/sessions/non-existent',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('should return 403 for session not owned by customer', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/sessions/other-customer-session',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('POST /api/v1/customer/sessions/:id/approve', () => {
    it('should approve a pending command', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      customer_id: 'test-customer-123',
                      updated_at: '2024-01-01T00:00:00Z',
                      commands: [
                        {
                          id: 'cmd-1',
                          type: 'config_change',
                          status: 'pending_approval',
                          requires_approval: true,
                        },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [{ id: 'session-123' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions/session-123/approve',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          commandId: 'cmd-1',
          approved: true,
          reason: 'Verified safe to execute',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.command).toMatchObject({
        id: 'cmd-1',
        status: 'approved',
      });
    });

    it('should reject a pending command', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      customer_id: 'test-customer-123',
                      updated_at: '2024-01-01T00:00:00Z',
                      commands: [
                        {
                          id: 'cmd-1',
                          type: 'config_change',
                          status: 'pending_approval',
                          requires_approval: true,
                        },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [{ id: 'session-123' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions/session-123/approve',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          commandId: 'cmd-1',
          approved: false,
          reason: 'Too risky',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.command.status).toBe('rejected');
    });

    it('should return 404 for non-existent command', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      customer_id: 'test-customer-123',
                      commands: [],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions/session-123/approve',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          commandId: 'non-existent',
          approved: true,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('COMMAND_NOT_FOUND');
    });

    it('should return 409 when session no longer exists during update', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      customer_id: 'test-customer-123',
                      updated_at: '2024-01-01T00:00:00Z',
                      commands: [
                        {
                          id: 'cmd-1',
                          type: 'config_change',
                          status: 'pending_approval',
                        },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                      data: [], // Session was deleted/reassigned or updated_at changed
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions/session-123/approve',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          commandId: 'cmd-1',
          approved: true,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('CONCURRENT_UPDATE_CONFLICT');
      expect(body.error.message).toBe(
        'Session was modified by another request. Please retry.'
      );
    });

    it('should reject approval for already processed command', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'diagnostic_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      customer_id: 'test-customer-123',
                      commands: [
                        {
                          id: 'cmd-1',
                          type: 'config_change',
                          status: 'completed',
                        },
                      ],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/sessions/session-123/approve',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          commandId: 'cmd-1',
          approved: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_COMMAND_STATE');
    });
  });

  describe('GET /api/v1/customer/system/info', () => {
    it('should return system information for authenticated users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/system/info',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('region');
      expect(body).toHaveProperty('features');
      expect(body.features).toHaveProperty('webSockets');
      expect(body.features).toHaveProperty('hitl');
    });

    it('should reject unauthenticated requests', async () => {
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Customer authentication required',
              requestId: request.id,
            },
          });
        }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/system/info',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
