import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Internal Authentication Middleware
 *
 * Validates requests from internal services (monitoring, metrics scrapers, etc.)
 * using a shared secret token in the X-Internal-Auth header.
 *
 * This middleware is intended for protecting internal-only endpoints like:
 * - /metrics (Prometheus scraping)
 * - /metrics/cloudwatch (CloudWatch metrics export)
 * - /health/internal (internal health checks)
 */

interface InternalAuthConfig {
  enabled: boolean;
  token: string | undefined;
}

const getInternalAuthConfig = (): InternalAuthConfig => {
  const enabled = process.env.INTERNAL_AUTH_ENABLED !== 'false';
  const token = process.env.INTERNAL_AUTH_TOKEN;

  // In test environment, allow bypassing if no token is set
  if (process.env.NODE_ENV === 'test' && !token) {
    return { enabled: false, token: undefined };
  }

  return { enabled, token };
};

/**
 * Middleware function for internal authentication
 */
export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getInternalAuthConfig();

  // Skip auth if disabled or in test mode without token
  if (!config.enabled) {
    return;
  }

  // Ensure token is configured
  if (!config.token) {
    request.log.error('Internal auth token not configured');
    await reply.status(503).send({
      error: 'Service temporarily unavailable',
      message: 'Internal authentication not configured',
    });
    return;
  }

  // Extract token from header (handle array case when duplicate headers are sent)
  const rawHeader = request.headers['x-internal-auth'];
  const providedToken = Array.isArray(rawHeader)
    ? rawHeader[0]
    : (rawHeader ?? '');

  if (!providedToken) {
    request.log.warn(
      {
        ip: request.ip,
        path: request.url,
        method: request.method,
      },
      'Missing internal auth header'
    );
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing authentication',
    });
    return;
  }

  // Validate token (constant-time comparison)
  if (!secureTokenCompare(providedToken, config.token)) {
    request.log.warn(
      {
        ip: request.ip,
        path: request.url,
        method: request.method,
      },
      'Invalid internal auth token'
    );
    await reply.status(403).send({
      error: 'Forbidden',
      message: 'Invalid authentication',
    });
    return;
  }

  // Authentication successful
  request.log.debug(
    {
      path: request.url,
      method: request.method,
    },
    'Internal auth successful'
  );
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Hook for use with Fastify's preHandler
 */
export const internalAuthHook = internalAuthMiddleware;
