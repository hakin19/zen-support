import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { customerAuthMiddleware } from './customer-auth.middleware';

// Mock Supabase client
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(),
}));

describe('Customer Authentication Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      headers: {},
      log: {
        error: vi.fn(),
      } as any,
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    mockSupabaseClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    };

    const { getSupabaseAdminClient } = vi.mocked(
      await import('@aizen/shared/utils/supabase-client')
    );
    getSupabaseAdminClient.mockReturnValue(mockSupabaseClient);
  });

  describe('Token Validation', () => {
    it('should reject request without authorization header', async () => {
      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Customer authentication required',
          requestId: 'req-123',
        },
      });
    });

    it('should reject request with invalid authorization format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token123',
      };

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization format',
          requestId: 'req-123',
        },
      });
    });

    it('should reject request with only "Bearer" without token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer',
      };

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization format',
          requestId: 'req-123',
        },
      });
    });

    it('should reject request with invalid JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-jwt-token',
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith(
        'invalid-jwt-token'
      );
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          requestId: 'req-123',
        },
      });
    });

    it('should reject request with expired JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-jwt-token',
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          requestId: 'req-123',
        },
      });
    });
  });

  describe('Successful Authentication', () => {
    it('should accept valid JWT and attach customer info to request', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      const mockUser = {
        id: 'user-123',
        email: 'customer@example.com',
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Mock the users table lookup
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { customer_id: 'customer-456' },
              error: null,
            }),
          }),
        }),
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith(
        'valid-jwt-token'
      );
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('users');
      expect(mockRequest.userId).toBe('user-123');
      expect(mockRequest.customerId).toBe('customer-456');
      expect(mockRequest.customerEmail).toBe('customer@example.com');
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should handle user without email', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      const mockUser = {
        id: 'user-789',
        email: null,
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { customer_id: 'customer-999' },
              error: null,
            }),
          }),
        }),
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.userId).toBe('user-789');
      expect(mockRequest.customerId).toBe('customer-999');
      expect(mockRequest.customerEmail).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should reject when user not found in customer database', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      const mockUser = {
        id: 'user-not-in-db',
        email: 'orphan@example.com',
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
          }),
        }),
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found in customer database',
          requestId: 'req-123',
        },
      });
    });

    it('should handle Supabase service errors', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error('Supabase service unavailable')
      );

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.log.error).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service temporarily unavailable',
          requestId: 'req-123',
        },
      });
    });

    it('should handle non-string authorization headers', async () => {
      mockRequest.headers = {
        authorization: ['Bearer', 'token123'] as any,
      };

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Customer authentication required',
          requestId: 'req-123',
        },
      });
    });
  });

  describe('JWT Claims Extraction', () => {
    it('should extract customer ID from JWT claims', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-with-claims',
      };

      const mockUser = {
        id: 'user-uuid-789',
        email: 'user@company.com',
        user_metadata: {
          full_name: 'John Doe',
        },
      };

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { customer_id: 'company-abc-123' },
              error: null,
            }),
          }),
        }),
      });

      await customerAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.userId).toBe('user-uuid-789');
      expect(mockRequest.customerId).toBe('company-abc-123');
      expect(mockRequest.customerEmail).toBe('user@company.com');
    });

    it('should handle multiple authorization header formats', async () => {
      const testCases = [
        { header: 'bearer token123', shouldFail: true },
        { header: 'BEARER token123', shouldFail: true },
        { header: 'Bearer  token123', shouldFail: true },
        { header: 'Bearer', shouldFail: true },
        { header: 'Bearer ', shouldFail: true },
      ];

      for (const testCase of testCases) {
        // Reset mocks for each test case
        mockReply.status = vi.fn().mockReturnThis();
        mockReply.send = vi.fn();

        // Reset Supabase mock to return error for invalid tokens
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });

        mockRequest.headers = {
          authorization: testCase.header,
        };

        await customerAuthMiddleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        if (testCase.shouldFail) {
          expect(mockReply.status).toHaveBeenCalledWith(401);
        }
      }
    });
  });
});
