import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerDeviceActionRoutes } from './device-actions';
import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';

// Mock dependencies
vi.mock('../middleware/customer-auth.middleware');

// Mock Supabase client
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getAuthenticatedSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

describe('Device Action Routes', () => {
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
        request.user = { id: 'test-user-456' };
      }
    );

    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(),
    };

    const { getAuthenticatedSupabaseClient } = vi.mocked(
      await import('@aizen/shared/utils/supabase-client')
    );
    getAuthenticatedSupabaseClient.mockReturnValue(mockSupabase);

    // Register routes
    registerDeviceActionRoutes(app);

    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/device-actions/:id/approve', () => {
    it('should approve a pending device action', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440000';
      const mockAction = {
        id: actionId,
        status: 'pending',
        device_id: 'device-123',
        command: 'test command',
        devices: { customer_id: 'test-customer-123' },
      };

      const mockUpdatedAction = {
        ...mockAction,
        status: 'approved',
        approved_by: 'test-user-456',
        approved_at: '2023-01-01T00:00:00.000Z',
      };

      // Mock the select query
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockAction,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      // Mock the update query
      const mockUpdate = vi.fn().mockReturnThis();
      const mockSelectAfterUpdate = vi.fn().mockReturnThis();
      const mockSingleAfterUpdate = vi.fn().mockResolvedValue({
        data: mockUpdatedAction,
        error: null,
      });

      mockEq.mockReturnValueOnce({
        select: mockSelectAfterUpdate,
      });
      mockSelectAfterUpdate.mockReturnValue({
        single: mockSingleAfterUpdate,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });
      mockSupabase.from.mockReturnValueOnce({
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({
        eq: mockEq,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/approve`,
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('approved');
      expect(body.approved_by).toBe('test-user-456');
    });

    it('should return 404 for non-existent action', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440001';

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/approve`,
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for non-pending action', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440002';
      const mockAction = {
        id: actionId,
        status: 'approved', // Already approved
        device_id: 'device-123',
        command: 'test command',
        devices: { customer_id: 'test-customer-123' },
      };

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockAction,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/approve`,
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_STATUS');
    });

    it('should require authentication', async () => {
      // Mock middleware to simulate unauthenticated request
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          request.customerId = undefined;
          request.user = undefined;
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/device-actions/550e8400-e29b-41d4-a716-446655440003/approve',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/device-actions/:id/reject', () => {
    it('should reject a pending device action', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440004';
      const mockAction = {
        id: actionId,
        status: 'pending',
        device_id: 'device-123',
        command: 'test command',
        metadata: {},
        devices: { customer_id: 'test-customer-123' },
      };

      const mockUpdatedAction = {
        ...mockAction,
        status: 'rejected',
        rejected_by: 'test-user-456',
        rejected_at: '2023-01-01T00:00:00.000Z',
        metadata: {
          rejection_reason: 'Test rejection reason',
        },
      };

      // Mock the select query
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockAction,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      // Mock the update query
      const mockUpdate = vi.fn().mockReturnThis();
      const mockSelectAfterUpdate = vi.fn().mockReturnThis();
      const mockSingleAfterUpdate = vi.fn().mockResolvedValue({
        data: mockUpdatedAction,
        error: null,
      });

      mockEq.mockReturnValueOnce({
        select: mockSelectAfterUpdate,
      });
      mockSelectAfterUpdate.mockReturnValue({
        single: mockSingleAfterUpdate,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });
      mockSupabase.from.mockReturnValueOnce({
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({
        eq: mockEq,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/reject`,
        payload: {
          reason: 'Test rejection reason',
        },
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('rejected');
      expect(body.rejected_by).toBe('test-user-456');
      expect(body.metadata.rejection_reason).toBe('Test rejection reason');
    });

    it('should reject without reason', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440004';
      const mockAction = {
        id: actionId,
        status: 'pending',
        device_id: 'device-123',
        command: 'test command',
        metadata: {},
        devices: { customer_id: 'test-customer-123' },
      };

      const mockUpdatedAction = {
        ...mockAction,
        status: 'rejected',
        rejected_by: 'test-user-456',
        rejected_at: '2023-01-01T00:00:00.000Z',
      };

      // Mock the select query
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockAction,
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      // Mock the update query
      const mockUpdate = vi.fn().mockReturnThis();
      const mockSelectAfterUpdate = vi.fn().mockReturnThis();
      const mockSingleAfterUpdate = vi.fn().mockResolvedValue({
        data: mockUpdatedAction,
        error: null,
      });

      mockEq.mockReturnValueOnce({
        select: mockSelectAfterUpdate,
      });
      mockSelectAfterUpdate.mockReturnValue({
        single: mockSingleAfterUpdate,
      });

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });
      mockSupabase.from.mockReturnValueOnce({
        update: mockUpdate,
      });
      mockUpdate.mockReturnValue({
        eq: mockEq,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/reject`,
        payload: {},
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('rejected');
      expect(body.rejected_by).toBe('test-user-456');
    });

    it('should return 404 for non-existent action', async () => {
      const actionId = '550e8400-e29b-41d4-a716-446655440001';

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      mockSelect.mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/device-actions/${actionId}/reject`,
        payload: {
          reason: 'Test reason',
        },
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should require authentication', async () => {
      // Mock middleware to simulate unauthenticated request
      vi.mocked(customerAuthMiddleware).mockImplementation(
        async (request, reply) => {
          request.customerId = undefined;
          request.user = undefined;
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/device-actions/550e8400-e29b-41d4-a716-446655440004/reject',
        payload: {
          reason: 'Test reason',
        },
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
