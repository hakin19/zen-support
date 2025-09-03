import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    customerId?: string;
    customerEmail?: string;
  }
}

/**
 * Customer authentication middleware
 * Validates Supabase JWT tokens from Authorization header
 * Adds customerId to the request object for downstream use
 */
export async function customerAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Customer authentication required',
          requestId: request.id,
        },
      });
    }

    // Extract Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid authorization format',
          requestId: request.id,
        },
      });
    }

    const token = parts[1];

    // Verify JWT with Supabase
    const supabase = getSupabaseAdminClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          requestId: request.id,
        },
      });
    }

    // Attach customer info to request for downstream use
    request.customerId = user.id;
    request.customerEmail = user.email ?? undefined;
  } catch (error) {
    request.log.error(error, 'Customer authentication middleware error');

    return reply.status(503).send({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable',
        requestId: request.id,
      },
    });
  }
}
