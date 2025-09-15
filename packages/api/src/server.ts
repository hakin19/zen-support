import { randomUUID } from 'crypto';
import * as fs from 'fs';

import cors from '@fastify/cors';
import fastify from 'fastify';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

// Diagnostic: Check environment when server module loads
if (process.env.NODE_ENV === 'test') {
  const diagLog = `[SERVER] Test mode - SUPABASE_URL: ${process.env.SUPABASE_URL}, REDIS_HOST: ${process.env.REDIS_HOST ?? 'localhost'}\n`;
  fs.appendFileSync('/tmp/test-diag.log', diagLog);
}

import { config } from './config';
import { aiRoutes } from './routes/ai';
import { registerChatRoutes } from './routes/chat';
import { registerCustomerDeviceRoutes } from './routes/customer-devices';
import { registerCustomerSessionRoutes } from './routes/customer-sessions';
import { registerDevHelperRoutes } from './routes/dev-helpers';
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
import { correlationIdPlugin } from './utils/correlation-id';

import type { FastifyInstance } from 'fastify';

export async function createServer(): Promise<FastifyInstance> {
  return createApp();
}

export async function createApp(): Promise<FastifyInstance> {
  // Initialize external clients if not already initialized (for tests)
  const { initializeSupabase } = await import(
    '@aizen/shared/utils/supabase-client'
  );
  const { initializeRedis } = await import('@aizen/shared/utils/redis-client');
  const { config } = await import('./config');

  if (config.supabase.url && config.supabase.anonKey) {
    initializeSupabase({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      serviceRoleKey: config.supabase.serviceRoleKey,
    });
  }

  // Initialize Redis if not already initialized
  initializeRedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  });
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

  // Register CORS plugin with environment-based configuration
  await app.register(cors, {
    origin: config.cors.origins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });

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

  // Register AI orchestration routes
  await app.register(aiRoutes);

  // Register WebSocket routes before chat routes (chat routes depend on websocketConnectionManager)
  await registerWebSocketRoutes(app);

  // Set connection manager in device auth service for broadcasting device status
  const { setConnectionManager } = await import(
    './services/device-auth.service'
  );
  setConnectionManager(getConnectionManager());

  registerChatRoutes(app);

  // Register dev helper routes (only in dev/test)
  registerDevHelperRoutes(app);

  // Start background processes
  try {
    const { startVisibilityCheck } = await import(
      './services/command-queue.service'
    );
    if (typeof startVisibilityCheck === 'function') {
      startVisibilityCheck();
    }
  } catch {
    // In tests with partial mocks, this import may not provide the function
  }

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
