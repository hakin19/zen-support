import { checkDependencies } from '../utils/dependency-checker';

import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  // Liveness check - always returns 200 if service is running
  // Used by ECS for container health monitoring
  app.get('/healthz', () => {
    return { status: 'ok' };
  });

  // Readiness check - returns 503 if dependencies are unhealthy
  // Used by ECS target group for traffic routing
  app.get('/readyz', async (request, reply) => {
    try {
      const result = await checkDependencies();

      if (!result.healthy) {
        return reply.status(503).send({
          ready: false,
          dependencies: result.dependencies,
        });
      }

      return {
        ready: true,
        dependencies: result.dependencies,
      };
    } catch (error) {
      request.log.error(error, 'Failed to check dependencies');
      return reply.status(503).send({
        ready: false,
        error: 'Failed to check dependencies',
      });
    }
  });

  // Version endpoint - returns API version only (no sensitive info)
  app.get('/version', () => {
    return {
      version: process.env.APP_VERSION ?? '0.0.1',
    };
  });

  // System info endpoint - authenticated only (to be implemented)
  app.get('/system/info', async (_request, reply) => {
    // TODO: Add authentication middleware
    // For now, return 401
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });
}
