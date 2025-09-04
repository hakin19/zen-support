import { randomUUID } from 'crypto';

import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';

/**
 * Generate a new correlation ID (UUID v4)
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Extract correlation ID from request headers or generate a new one
 */
export function extractCorrelationId(request: FastifyRequest): string {
  // Fastify normalizes headers to lowercase, but we should handle both cases
  const headers = request.headers;

  // Check for X-Request-ID header (preferred) - try multiple variations
  const requestId = (headers['x-request-id'] ||
    headers['X-Request-Id'] ||
    headers['X-Request-ID']) as string;
  if (requestId) return requestId;

  // Check for X-Correlation-ID header (alternative) - try multiple variations
  const correlationId = (headers['x-correlation-id'] ||
    headers['X-Correlation-Id'] ||
    headers['X-Correlation-ID']) as string;
  if (correlationId) return correlationId;

  // Use Fastify's generated request ID if available
  if (request.id) return request.id;

  // Generate a new correlation ID
  return generateCorrelationId();
}

/**
 * Attach correlation ID to response headers
 */
export function attachCorrelationId(
  reply: FastifyReply,
  correlationId: string,
  includeBoth = false
): void {
  reply.header('X-Request-ID', correlationId);

  if (includeBoth) {
    reply.header('X-Correlation-ID', correlationId);
  }
}

/**
 * Fastify plugin to automatically handle correlation IDs
 */
export const correlationIdPlugin: FastifyPluginAsync = async fastify => {
  // Decorate request with correlationId property
  fastify.decorateRequest('correlationId', '');

  // Add hook to extract and set correlation ID
  fastify.addHook('onRequest', async (request, reply) => {
    const correlationId = extractCorrelationId(request);
    request.correlationId = correlationId;
    attachCorrelationId(reply, correlationId);
  });
};

// Add type declarations
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/**
 * Add correlation ID to WebSocket messages
 */
export function addCorrelationIdToMessage(
  message: Record<string, any>,
  correlationId?: string
): Record<string, any> {
  if (message.requestId) {
    return message; // Already has a correlation ID
  }

  return {
    ...message,
    requestId: correlationId || generateCorrelationId(),
  };
}

/**
 * Extract correlation ID from WebSocket message
 */
export function extractCorrelationIdFromMessage(
  message: Record<string, any>
): string {
  return message.requestId || message.correlationId || generateCorrelationId();
}

/**
 * Create headers with correlation ID for downstream requests
 */
export function createCorrelatedHeaders(
  correlationId: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    'X-Request-ID': correlationId,
  };
}

/**
 * Add correlation ID to error responses
 */
export function createCorrelatedError(
  error: { code?: string; message: string },
  correlationId: string
): { error: { code?: string; message: string; requestId: string } } {
  return {
    error: {
      ...error,
      requestId: correlationId,
    },
  };
}

/**
 * Helper to propagate correlation ID in Redis operations
 */
export function addCorrelationToRedisData(
  data: Record<string, any>,
  correlationId: string
): Record<string, any> {
  return {
    ...data,
    metadata: {
      ...(data.metadata || {}),
      correlationId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Helper to propagate correlation ID in Supabase requests
 */
export function createSupabaseOptions(
  correlationId: string,
  options: Record<string, any> = {}
): Record<string, any> {
  return {
    ...options,
    headers: createCorrelatedHeaders(correlationId, options.headers),
  };
}
