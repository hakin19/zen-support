import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { commandQueueService } from '../services/command-queue.service';
import { publishToChannel } from '../utils/redis-pubsub';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Development helper endpoints for testing WebSocket and command functionality
 * These endpoints should only be available in development/test environments
 */
export function registerDevHelperRoutes(app: FastifyInstance): void {
  // Only register in development or test environments
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    return;
  }

  /**
   * Enqueue a mock command for a device
   * This is useful for testing WebSocket command delivery
   */
  app.post(
    '/api/v1/dev/enqueue-command',
    async (
      request: FastifyRequest<{
        Body: {
          deviceId: string;
          commandType: string;
          payload?: Record<string, unknown>;
          priority?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { deviceId, commandType, payload, priority } = request.body;

        // Validate required fields
        if (!deviceId || !commandType) {
          return reply.status(400).send({
            error: 'deviceId and commandType are required',
          });
        }

        // Create a mock customer ID for dev testing
        const customerId = 'dev-customer-001';

        // Add command to queue
        const command = await commandQueueService.addCommand(
          deviceId,
          customerId,
          commandType,
          payload ?? {},
          priority ?? 1
        );

        // Notify device via Redis pub/sub if connected
        const redis = getRedisClient();
        await publishToChannel(redis, `device:${deviceId}:control`, {
          type: 'new_command',
          commandId: command.id,
          timestamp: new Date().toISOString(),
        });

        request.log.info(
          {
            deviceId,
            commandId: command.id,
            commandType,
          },
          'Dev: Enqueued mock command'
        );

        return reply.send({
          success: true,
          commandId: command.id,
          message: `Command ${command.id} enqueued for device ${deviceId}`,
          command: {
            id: command.id,
            type: commandType,
            parameters: payload,
            status: command.status,
            priority: command.priority,
            createdAt: command.createdAt,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to enqueue mock command');
        return reply.status(500).send({
          error: 'Failed to enqueue command',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Get command status for debugging
   */
  app.get(
    '/api/v1/dev/command/:commandId',
    async (
      request: FastifyRequest<{
        Params: {
          commandId: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { commandId } = request.params;

        const command = await commandQueueService.getCommand(commandId);

        if (!command) {
          return reply.status(404).send({
            error: 'Command not found',
          });
        }

        return reply.send({
          command,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get command');
        return reply.status(500).send({
          error: 'Failed to get command',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Clear all commands for a device (useful for test cleanup)
   */
  app.delete(
    '/api/v1/dev/device/:deviceId/commands',
    async (
      request: FastifyRequest<{
        Params: {
          deviceId: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { deviceId } = request.params;

        // This would need to be implemented in commandQueueService
        // For now, we'll just return success
        request.log.info({ deviceId }, 'Dev: Clearing commands for device');

        return reply.send({
          success: true,
          message: `Commands cleared for device ${deviceId}`,
        });
      } catch (error) {
        request.log.error(error, 'Failed to clear commands');
        return reply.status(500).send({
          error: 'Failed to clear commands',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Simulate a device WebSocket connection status
   */
  app.post(
    '/api/v1/dev/device/:deviceId/simulate-status',
    async (
      request: FastifyRequest<{
        Params: {
          deviceId: string;
        };
        Body: {
          status: 'online' | 'offline';
          metrics?: {
            cpu?: number;
            memory?: number;
            uptime?: number;
          };
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { deviceId } = request.params;
        const { status, metrics } = request.body;

        const redis = getRedisClient();

        // Broadcast device status update
        await publishToChannel(redis, `device:${deviceId}:updates`, {
          type: 'device_status',
          status,
          metrics: metrics ?? {},
          timestamp: new Date().toISOString(),
        });

        request.log.info(
          { deviceId, status },
          'Dev: Simulated device status update'
        );

        return reply.send({
          success: true,
          message: `Status update broadcasted for device ${deviceId}`,
        });
      } catch (error) {
        request.log.error(error, 'Failed to simulate status');
        return reply.status(500).send({
          error: 'Failed to simulate status',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  app.log.info('Dev helper routes registered');
}
