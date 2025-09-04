import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
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

    // Get the actual customer_id from the users table
    // user.id is the Supabase auth user ID, we need the tenant customer_id
    // Use admin client here because this is authentication/authorization logic
    // and needs to work regardless of RLS policies
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('customer_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found in customer database',
          requestId: request.id,
        },
      });
    }

    // Attach both user ID and customer ID to request for downstream use
    request.userId = user.id; // Supabase auth user ID
    request.customerId = userData.customer_id as string; // Actual tenant/customer ID
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
