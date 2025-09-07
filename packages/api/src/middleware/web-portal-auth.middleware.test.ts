import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastify from 'fastify';
import type { Database } from '@aizen/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock dependencies
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  getSupabaseAdminClient: vi.fn(),
  getAuthenticatedSupabaseClient: vi.fn(),
}));

// Define role types
type UserRole = 'owner' | 'admin' | 'viewer';

// Auth middleware function to test
export async function webPortalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  options?: { requireRole?: UserRole[] }
) {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing authentication token',
      requestId: request.id,
    });
  }

  try {
    // Get authenticated client
    const { getAuthenticatedSupabaseClient } = await import(
      '@aizen/shared/utils/supabase-client'
    );
    const supabase = getAuthenticatedSupabaseClient(token);

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
        requestId: request.id,
      });
    }

    // Get user's role for their customer
    const { getSupabaseAdminClient } = await import(
      '@aizen/shared/utils/supabase-client'
    );
    const adminClient = getSupabaseAdminClient();

    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('customer_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'User does not have access to any customer',
        requestId: request.id,
      });
    }

    // Check role requirements if specified
    if (options?.requireRole && options.requireRole.length > 0) {
      if (!options.requireRole.includes(roleData.role as UserRole)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: `Insufficient permissions. Required role: ${options.requireRole.join(
            ' or '
          )}`,
          requestId: request.id,
        });
      }
    }

    // Attach auth data to request
    request.userId = user.id;
    request.customerId = roleData.customer_id;
    request.userRole = roleData.role as UserRole;
    request.customerEmail = user.email;
  } catch (error) {
    request.log.error({ error }, 'Authentication error');
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      requestId: request.id,
    });
  }
}

// Extend FastifyRequest interface
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    customerId?: string;
    userRole?: UserRole;
    customerEmail?: string;
  }
}

describe('Web Portal Authentication Middleware', () => {
  let app: FastifyInstance;
  let mockSupabaseClient: Partial<SupabaseClient<Database>>;
  let mockAdminClient: Partial<SupabaseClient<Database>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = fastify({
      logger: false,
    });

    // Setup mock clients
    mockSupabaseClient = {
      auth: {
        getUser: vi.fn(),
      },
    } as any;

    mockAdminClient = {
      from: vi.fn(),
    } as any;

    const { getSupabaseAdminClient, getAuthenticatedSupabaseClient } =
      vi.mocked(await import('@aizen/shared/utils/supabase-client'));

    getAuthenticatedSupabaseClient.mockReturnValue(
      mockSupabaseClient as SupabaseClient<Database>
    );
    getSupabaseAdminClient.mockReturnValue(
      mockAdminClient as SupabaseClient<Database>
    );

    // Do not call app.ready() here - routes will be registered in individual tests
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return { success: true };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Missing authentication token',
      });
    });

    it('should reject requests with invalid token', async () => {
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' } as any,
      });

      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return { success: true };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      });
    });

    it('should accept valid token and attach user data', async () => {
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
          } as any,
        },
        error: null,
      });

      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'admin',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return {
            userId: request.userId,
            customerId: request.customerId,
            userRole: request.userRole,
            customerEmail: request.customerEmail,
          };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        userId: 'user-123',
        customerId: 'customer-123',
        userRole: 'admin',
        customerEmail: 'user@example.com',
      });
    });
  });

  describe('Role-Based Access Control', () => {
    beforeEach(() => {
      // Setup successful authentication
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
          } as any,
        },
        error: null,
      });
    });

    it('should allow owner role when owner is required', async () => {
      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'owner',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: async (request, reply) => {
          await webPortalAuthMiddleware(request, reply, {
            requireRole: ['owner'],
          });
        },
        handler: async (request, reply) => {
          return { success: true, role: request.userRole };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        role: 'owner',
      });
    });

    it('should allow admin role when admin or owner is required', async () => {
      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'admin',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: async (request, reply) => {
          await webPortalAuthMiddleware(request, reply, {
            requireRole: ['owner', 'admin'],
          });
        },
        handler: async (request, reply) => {
          return { success: true, role: request.userRole };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        role: 'admin',
      });
    });

    it('should reject viewer role when admin is required', async () => {
      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'viewer',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: async (request, reply) => {
          await webPortalAuthMiddleware(request, reply, {
            requireRole: ['owner', 'admin'],
          });
        },
        handler: async (request, reply) => {
          return { success: true };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: 'Insufficient permissions. Required role: owner or admin',
      });
    });

    it('should allow any authenticated user when no role is required', async () => {
      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'viewer',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return { success: true, role: request.userRole };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        role: 'viewer',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle user without any customer association', async () => {
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
          } as any,
        },
        error: null,
      });

      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'No rows found' } as any,
            }),
          }),
        }),
      } as any);

      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return { success: true };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: 'User does not have access to any customer',
      });
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
          } as any,
        },
        error: null,
      });

      vi.mocked(mockAdminClient.from).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      app.get('/test', {
        preHandler: webPortalAuthMiddleware,
        handler: async (request, reply) => {
          return { success: true };
        },
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
    });
  });

  describe('Optional Authentication', () => {
    it('should create optional auth middleware variant', async () => {
      const optionalWebPortalAuth = async (
        request: FastifyRequest,
        reply: FastifyReply
      ) => {
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          // Optional auth - continue without auth data
          return;
        }

        // Try to authenticate but don't fail if it doesn't work
        try {
          await webPortalAuthMiddleware(request, reply);
        } catch (error) {
          // Log but continue
          request.log.debug({ error }, 'Optional auth failed');
        }
      };

      app.get('/test', {
        preHandler: optionalWebPortalAuth,
        handler: async (request, reply) => {
          return {
            authenticated: !!request.userId,
            userId: request.userId,
          };
        },
      });

      // Test without auth header
      const response1 = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response1.statusCode).toBe(200);
      expect(response1.json()).toMatchObject({
        authenticated: false,
      });

      // Test with valid auth header
      vi.mocked(mockSupabaseClient.auth!.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
          } as any,
        },
        error: null,
      });

      vi.mocked(mockAdminClient.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                customer_id: 'customer-123',
                role: 'viewer',
              },
              error: null,
            }),
          }),
        }),
      } as any);

      const response2 = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(response2.statusCode).toBe(200);
      expect(response2.json()).toMatchObject({
        authenticated: true,
        userId: 'user-123',
      });
    });
  });
});
