import { randomUUID } from 'crypto';

import fastify from 'fastify';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { config } from './config';
import { registerChatRoutes } from './routes/chat';
import { registerCustomerDeviceRoutes } from './routes/customer-devices';
import { registerCustomerSessionRoutes } from './routes/customer-sessions';
import { registerDeviceAuthRoutes } from './routes/device-auth';
import { registerDeviceCommandRoutes } from './routes/device-commands';
import { devicesRoutes } from './routes/devices';
import { registerHealthRoutes } from './routes/health';
import { organizationRoutes } from './routes/organization';
import { registerPromptsRoutes } from './routes/prompts';
import { usersRoutes } from './routes/users';
import {
  registerWebSocketRoutes,
  getConnectionManager,
} from './routes/websocket';
import { startVisibilityCheck } from './services/command-queue.service';
import { correlationIdPlugin } from './utils/correlation-id';

import type { FastifyInstance } from 'fastify';

export async function createServer(): Promise<FastifyInstance> {
  return createApp();
}

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: config.logger,
    trustProxy: true, // Important for ALB and proper IP handling
    requestIdHeader: 'x-request-id',
    genReqId: req => {
      // Use client-provided request ID or generate a new one
      const requestId = req.headers['x-request-id'];
      return typeof requestId === 'string' ? requestId : randomUUID();
    },
    requestTimeout: config.server.requestTimeout,
  });

  // Configure server timeouts for ALB compatibility
  app.server.keepAliveTimeout = config.server.keepAliveTimeout;
  app.server.headersTimeout = config.server.headersTimeout;

  // Register plugins
  // TODO: Add @fastify/sensible when version compatibility is resolved

  // Register correlation ID plugin (replaces the old hook)
  await app.register(correlationIdPlugin);

  // Add Redis client to app
  const redisClient = getRedisClient();
  app.decorate('redis', redisClient);

  // Register routes
  registerHealthRoutes(app);
  registerDeviceAuthRoutes(app);
  registerDeviceCommandRoutes(app);
  registerCustomerDeviceRoutes(app);
  registerCustomerSessionRoutes(app);

  // Register new UI routes
  await app.register(organizationRoutes);
  registerPromptsRoutes(app);
  await app.register(devicesRoutes);
  await app.register(usersRoutes);

  // Register WebSocket routes before chat routes (chat routes depend on websocketConnectionManager)
  await registerWebSocketRoutes(app);

  // Set connection manager in device auth service for broadcasting device status
  const { setConnectionManager } = await import(
    './services/device-auth.service'
  );
  setConnectionManager(getConnectionManager());

  registerChatRoutes(app);

  // Start background processes
  startVisibilityCheck();

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode ?? 500;
    const errorResponse = {
      error: {
        code: error.code ?? 'INTERNAL_SERVER_ERROR',
        message: error.message ?? 'An unexpected error occurred',
        requestId: request.id,
      },
    };

    return reply.status(statusCode).send(errorResponse);
  });

  // Add cleanup hook for proper test teardown
  app.addHook('onClose', async () => {
    // Stop background processes
    const { stopVisibilityCheck } = await import(
      './services/command-queue.service'
    );
    stopVisibilityCheck();

    // Close WebSocket connections
    const connectionManager = getConnectionManager();
    if (connectionManager) {
      await connectionManager.closeAllConnections();
    }
  });

  return app;
}

export async function startServer(
  app: FastifyInstance
): Promise<FastifyInstance> {
  try {
    await app.listen({
      port: config.port,
      host: config.host,
    });
    return app;
  } catch (error) {
    app.log.error(error);
    throw error;
  }
}

export async function gracefulShutdown(app: FastifyInstance): Promise<void> {
  try {
    app.log.info('Starting graceful shutdown...');

    // Close WebSocket connections gracefully
    const connectionManager = getConnectionManager();
    if (connectionManager) {
      app.log.info('Closing WebSocket connections...');
      await connectionManager.closeAllConnections();
      app.log.info('WebSocket connections closed');
    }

    // Stop background processes
    const { stopVisibilityCheck } = await import(
      './services/command-queue.service'
    );
    stopVisibilityCheck();
    app.log.info('Background processes stopped');

    // Close Fastify server
    await app.close();
    app.log.info('Server closed successfully');

    // Close external connections
    const { closeRedis } = await import('@aizen/shared/utils/redis-client');
    await closeRedis();
    app.log.info('Redis connection closed');
  } catch (error) {
    app.log.error(error, 'Error during graceful shutdown');
  }
}
