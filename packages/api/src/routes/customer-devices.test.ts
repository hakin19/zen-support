import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerCustomerDeviceRoutes } from './customer-devices';
import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';
import { deviceAuthService } from '../services/device-auth.service';

// Mock dependencies
vi.mock('../middleware/customer-auth.middleware');
vi.mock('../services/device-auth.service', () => ({
  deviceAuthService: {
    createActivationCode: vi.fn(),
  },
}));

// Mock Supabase client
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
          single: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
    })),
  })),
  getAuthenticatedSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
          single: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

describe('Customer Device Routes', () => {
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
    registerCustomerDeviceRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/customer/devices/provision', () => {
    it('should provision a device with activation code', async () => {
      const mockActivationCode = 'ABC123';
      vi.mocked(deviceAuthService.createActivationCode).mockResolvedValue(
        mockActivationCode
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/devices/provision',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'device-001',
          deviceName: 'Office Router',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device).toMatchObject({
        id: 'device-001',
        activationCode: mockActivationCode,
      });
      expect(body.device.expiresAt).toBeDefined();
      expect(body.instructions).toContain(mockActivationCode);
      expect(deviceAuthService.createActivationCode).toHaveBeenCalledWith(
        'test-customer-123',
        'device-001'
      );
    });

    it('should provision device without name', async () => {
      vi.mocked(deviceAuthService.createActivationCode).mockResolvedValue(
        'XYZ789'
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/devices/provision',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'device-002',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe('device-002');
      expect(body.device.activationCode).toBe('XYZ789');
    });

    it('should reject request without authentication', async () => {
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          request.customerId = undefined;
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/devices/provision',
        payload: {
          deviceId: 'device-003',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle activation code generation failure', async () => {
      vi.mocked(deviceAuthService.createActivationCode).mockRejectedValue(
        new Error('Redis error')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/devices/provision',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          deviceId: 'device-004',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to generate activation code');
    });

    it('should validate required deviceId field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/devices/provision',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/customer/devices', () => {
    it('should list all customer devices', async () => {
      const mockDevices = [
        {
          id: 'device-001',
          name: 'Office Router',
          status: 'online',
          last_seen: '2025-01-04T10:00:00Z',
          created_at: '2025-01-01T10:00:00Z',
        },
        {
          id: 'device-002',
          name: 'Warehouse Gateway',
          status: 'offline',
          last_seen: '2025-01-03T10:00:00Z',
          created_at: '2025-01-02T10:00:00Z',
        },
      ];

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          callCount++;
          // First call is for fetching devices
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: mockDevices,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          // Second call is for count
          if (callCount === 2) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  count: 2,
                  error: null,
                }),
              }),
            };
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.devices).toHaveLength(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.hasMore).toBe(false);
      expect(body.devices[0]).toMatchObject({
        id: 'device-001',
        name: 'Office Router',
        status: 'online',
        lastSeen: '2025-01-04T10:00:00Z',
      });
    });

    it('should return empty list when customer has no devices', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'devices') {
          callCount++;
          // First call is for fetching devices
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          // Second call is for count
          if (callCount === 2) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  count: 0,
                  error: null,
                }),
              }),
            };
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.devices).toHaveLength(0);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should reject unauthenticated requests', async () => {
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          request.customerId = undefined;
        }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Database connection failed'),
            }),
          }),
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to retrieve devices');
    });
  });

  describe('GET /api/v1/customer/devices/:id/status', () => {
    it('should return device status for owned device', async () => {
      const mockDevice = {
        id: 'device-001',
        name: 'Office Router',
        status: 'online',
        last_seen: '2025-01-04T10:00:00Z',
        created_at: '2025-01-01T10:00:00Z',
        metrics: {
          cpu: 45,
          memory: 60,
          uptime: 3600,
        },
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockDevice,
                error: null,
              }),
            }),
          }),
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices/device-001/status',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device).toMatchObject({
        id: 'device-001',
        name: 'Office Router',
        status: 'online',
        lastHeartbeat: '2025-01-04T10:00:00Z',
        metrics: {
          cpu: 45,
          memory: 60,
          uptime: 3600,
        },
      });
    });

    it('should return 404 for non-existent device', async () => {
      mockSupabase.from.mockReturnValue({
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
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices/non-existent/status',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('DEVICE_NOT_FOUND');
    });

    it('should return 403 for device not owned by customer', async () => {
      mockSupabase.from.mockReturnValue({
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
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices/other-customer-device/status',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('DEVICE_NOT_FOUND');
    });

    it('should reject unauthenticated requests', async () => {
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          request.customerId = undefined;
        }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices/device-001/status',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockRejectedValue(new Error('Database connection failed')),
            }),
          }),
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/devices/device-001/status',
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
