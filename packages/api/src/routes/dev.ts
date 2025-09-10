import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { commandQueueService } from '../services/command-queue.service';
import { publishToChannel } from '../utils/redis-pubsub';

import type { FastifyInstance } from 'fastify';

interface MockCommandBody {
  deviceId: string;
  commandType?: string;
  payload?: Record<string, unknown>;
  priority?: number;
}

export function registerDevRoutes(app: FastifyInstance): void {
  // Dev helper endpoint to enqueue a mock command to a device
  app.post<{ Body: MockCommandBody }>(
    '/api/v1/dev/mock/command',
    async (request, reply) => {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Not available in production' },
        });
      }

      const {
        deviceId,
        commandType = 'echo',
        payload = { text: 'hello' },
        priority = 1,
      } = request.body ?? ({} as MockCommandBody);

      if (!deviceId) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'deviceId is required' },
        });
      }

      try {
        const command = await commandQueueService.addCommand(
          deviceId,
          'dev-helper',
          commandType,
          payload,
          priority
        );

        const redis = getRedisClient();
        await publishToChannel(redis, `device:${deviceId}:control`, {
          type: 'new_command',
          commandId: command.id,
          timestamp: new Date().toISOString(),
        });

        return reply.send({ commandId: command.id });
      } catch (error) {
        request.log.error(error, 'Failed to enqueue mock command');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to enqueue mock command',
          },
        });
      }
    }
  );
}
