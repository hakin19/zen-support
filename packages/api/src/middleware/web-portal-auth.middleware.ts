import {
  getSupabaseAdminClient,
  getAuthenticatedSupabaseClient,
} from '@aizen/shared/utils/supabase-client';

import type { FastifyRequest, FastifyReply } from 'fastify';

// Define role types based on database enum
export type UserRole = 'owner' | 'admin' | 'viewer';

// Extend FastifyRequest interface
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    customerId?: string;
    userRole?: UserRole;
    customerEmail?: string;
  }
}

export interface WebPortalAuthOptions {
  requireRole?: UserRole[];
}

/**
 * Web Portal Authentication Middleware
 * Validates JWT token and assigns user role for the customer
 */
export async function webPortalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  options?: WebPortalAuthOptions
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing authentication token',
      requestId: request.id,
    });
  }

  try {
    // Get authenticated client with user's token
    const supabase = getAuthenticatedSupabaseClient(token);

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      request.log.debug({ authError }, 'Authentication failed');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
        requestId: request.id,
      });
    }

    // Get user's role for their customer using admin client
    const adminClient = getSupabaseAdminClient();
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('customer_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      request.log.debug({ roleError, userId: user.id }, 'No customer access');
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'User does not have access to any customer',
        requestId: request.id,
      });
    }

    // Check role requirements if specified
    if (options?.requireRole && options.requireRole.length > 0) {
      const userRole = roleData.role as UserRole;
      if (!options.requireRole.includes(userRole)) {
        request.log.debug(
          {
            userRole: roleData.role as string,
            requiredRoles: options.requireRole,
          },
          'Insufficient permissions'
        );
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
    request.customerId = roleData.customer_id as string;
    request.userRole = roleData.role as UserRole;
    request.customerEmail = user.email ?? undefined;

    request.log.debug(
      {
        userId: request.userId,
        customerId: request.customerId,
        userRole: request.userRole,
      },
      'User authenticated successfully'
    );
  } catch (error) {
    request.log.error({ error }, 'Authentication error');
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      requestId: request.id,
    });
  }
}

/**
 * Optional Web Portal Authentication Middleware
 * Attempts authentication but doesn't fail if token is missing or invalid
 */
export async function optionalWebPortalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    // No token provided, continue without auth
    request.log.debug('No auth token provided, continuing as anonymous');
    return;
  }

  try {
    // Get authenticated client with user's token
    const supabase = getAuthenticatedSupabaseClient(token);

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      request.log.debug(
        { authError },
        'Optional auth failed, continuing as anonymous'
      );
      return; // Continue without auth instead of sending error response
    }

    // Get user's role for their customer using admin client
    const adminClient = getSupabaseAdminClient();
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('customer_id, role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      request.log.debug(
        { roleError, userId: user.id },
        'No customer access, continuing as anonymous'
      );
      return; // Continue without auth instead of sending error response
    }

    // Attach auth data to request if successful
    request.userId = user.id;
    request.customerId = roleData.customer_id as string;
    request.userRole = roleData.role as UserRole;
    request.customerEmail = user.email ?? undefined;

    request.log.debug(
      {
        userId: request.userId,
        customerId: request.customerId,
        userRole: request.userRole,
      },
      'Optional auth successful'
    );
  } catch (error) {
    // Any unexpected errors, log and continue as anonymous
    request.log.debug(
      { error },
      'Optional auth error, continuing as anonymous'
    );
  }
}

/**
 * Role-based middleware factories
 */
export const requireOwnerRole = (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> =>
  webPortalAuthMiddleware(request, reply, { requireRole: ['owner'] });

export const requireAdminRole = (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> =>
  webPortalAuthMiddleware(request, reply, { requireRole: ['owner', 'admin'] });

export const requireViewerRole = (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> =>
  webPortalAuthMiddleware(request, reply, {
    requireRole: ['owner', 'admin', 'viewer'],
  });
