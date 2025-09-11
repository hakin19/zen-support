import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { deviceAuthMiddleware } from '../middleware/device-auth.middleware';
import { commandQueueService } from '../services/command-queue.service';
import { publishToChannel } from '../utils/redis-pubsub';

import type { FastifyInstance } from 'fastify';

interface ClaimBody {
  limit?: number;
  visibilityTimeout?: number;
}

interface ExtendBody {
  claimToken: string;
  extensionMs?: number;
}

interface ResultBody {
  claimToken: string;
  status: 'success' | 'failure' | 'timeout';
  output?: string;
  error?: string;
  executedAt: string;
  duration: number;
}

export function registerDeviceCommandRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/device/commands
   * Enqueue a new command for the authenticated device and notify via WebSocket
   */
  app.post<{
    Body: {
      command: string;
      parameters?: Record<string, unknown>;
      priority?: number;
    };
  }>(
    '/api/v1/device/commands',
    {
      preHandler: [deviceAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string' },
            parameters: { type: 'object' },
            priority: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const deviceId = request.deviceId;
      const customerId = request.customerId;
      if (!deviceId || !customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Device authentication required',
          },
        });
      }

      try {
        const priority = request.body.priority ?? 1;
        // Create command
        const command = await commandQueueService.addCommand(
          deviceId,
          customerId,
          request.body.command,
          request.body.parameters ?? {},
          priority
        );

        // Immediately claim to generate a claim token for the device to submit results
        const claimed = await commandQueueService.claimCommands(
          deviceId,
          1,
          300000
        );
        const claimedCommand = claimed.find(c => c.id === command.id) ?? null;

        // Notify device via Redis pub/sub (forwarded by WS route)
        const redis = getRedisClient();
        const controlChannel = `device:${deviceId}:control`;
        await publishToChannel(redis, controlChannel, {
          type: 'command',
          // Legacy top-level fields for simpler WS clients/tests
          id: command.id,
          command: command.type,
          parameters: command.parameters,
          // Payload shape used by device-agent
          payload: {
            id: command.id,
            type: command.type,
            parameters: command.parameters,
            claimToken: claimedCommand?.claimToken,
            visibleUntil: claimedCommand?.visibleUntil,
            timestamp: new Date().toISOString(),
          },
        });

        return reply
          .status(201)
          .send({ id: command.id, status: command.status });
      } catch (error) {
        request.log.error(error, 'Failed to enqueue device command');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to enqueue command',
          },
        });
      }
    }
  );
  /**
   * POST /api/v1/device/commands/claim
   * Claim pending commands for processing with visibility timeout
   */
  app.post<{ Body: ClaimBody }>(
    '/api/v1/device/commands/claim',
    {
      preHandler: [deviceAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              default: 1,
            },
            visibilityTimeout: {
              type: 'integer',
              minimum: 60000, // 1 minute
              maximum: 3600000, // 1 hour
              default: 300000, // 5 minutes
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (!request.deviceId) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Device authentication required',
            },
          });
        }

        // Claim commands with limit and visibility timeout from request
        const commands = await commandQueueService.claimCommands(
          request.deviceId,
          request.body.limit ?? 1,
          request.body.visibilityTimeout ?? 300000
        );

        return reply.send({ commands });
      } catch (error) {
        request.log.error(error, 'Failed to claim commands');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to claim commands',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/device/commands/:id/extend
   * Extend visibility timeout for a claimed command
   */
  app.post<{ Params: { id: string }; Body: ExtendBody }>(
    '/api/v1/device/commands/:id/extend',
    {
      preHandler: [deviceAuthMiddleware],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['claimToken'],
          properties: {
            claimToken: { type: 'string' },
            extensionMs: {
              type: 'integer',
              minimum: 60000, // 1 minute
              maximum: 300000, // 5 minutes (matching spec max)
              default: 300000, // 5 minutes
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (!request.deviceId) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Device authentication required',
            },
          });
        }

        const { claimToken, extensionMs = 300000 } = request.body;
        const commandId = request.params.id;

        const result = await commandQueueService.extendVisibility(
          commandId,
          claimToken,
          request.deviceId,
          extensionMs
        );

        if (!result.success) {
          if (result.error === 'NOT_FOUND') {
            return reply.status(404).send({
              error: {
                code: 'COMMAND_NOT_FOUND',
                message: 'Command not found or not claimed by this device',
              },
            });
          }
          if (result.error === 'INVALID_CLAIM') {
            return reply.status(403).send({
              error: {
                code: 'INVALID_CLAIM_TOKEN',
                message: 'Invalid or expired claim token',
              },
            });
          }
        }

        return reply.send({
          success: true,
          visibleUntil: result.visibleUntil ?? '',
        });
      } catch (error) {
        request.log.error(error, 'Failed to extend command visibility');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to extend command visibility',
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/device/commands/:id/result
   * Submit result for a claimed command
   */
  app.post<{ Params: { id: string }; Body: ResultBody }>(
    '/api/v1/device/commands/:id/result',
    {
      preHandler: [deviceAuthMiddleware],
      // Limit body size to 100KB for result submissions (default is 1MB)
      bodyLimit: 102400, // 100KB in bytes
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['claimToken', 'status', 'executedAt', 'duration'],
          properties: {
            claimToken: { type: 'string' },
            status: {
              type: 'string',
              enum: ['success', 'failure', 'timeout'],
            },
            output: {
              type: 'string',
              maxLength: 10000, // 10KB max
            },
            error: {
              type: 'string',
              maxLength: 5000, // 5KB max
            },
            executedAt: {
              type: 'string',
              format: 'date-time',
            },
            duration: {
              type: 'number',
              minimum: 0,
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (!request.deviceId) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Device authentication required',
            },
          });
        }

        const { claimToken, status, output, error, executedAt, duration } =
          request.body;
        const commandId = request.params.id;

        // Build result object for storage
        const result = {
          status,
          output: output ? output.substring(0, 10000) : undefined, // Ensure limits
          error: error ? error.substring(0, 5000) : undefined,
          executedAt,
          duration,
        };

        const submitResult = await commandQueueService.submitResult(
          commandId,
          claimToken,
          request.deviceId,
          result
        );

        if (!submitResult.success) {
          if (submitResult.error === 'NOT_FOUND') {
            return reply.status(404).send({
              error: {
                code: 'COMMAND_NOT_FOUND',
                message: 'Command not found or not claimed by this device',
              },
            });
          }
          if (submitResult.error === 'INVALID_CLAIM') {
            return reply.status(403).send({
              error: {
                code: 'INVALID_CLAIM_TOKEN',
                message: 'Invalid or expired claim token',
              },
            });
          }
          if (submitResult.error === 'ALREADY_COMPLETED') {
            return reply.status(409).send({
              error: {
                code: 'COMMAND_ALREADY_COMPLETED',
                message: 'Command has already been completed',
              },
            });
          }
        }

        return reply.send({
          success: true,
        });
      } catch (error) {
        request.log.error(error, 'Failed to submit command result');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to submit command result',
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/device/commands/:id
   * Get a command status/result (restricted to the authenticated device)
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/device/commands/:id',
    {
      preHandler: [deviceAuthMiddleware],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const deviceId = request.deviceId;
        if (!deviceId) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Device authentication required',
            },
          });
        }

        const command = await commandQueueService.getCommand(request.params.id);
        if (!command || command.deviceId !== deviceId) {
          return reply.status(404).send({
            error: {
              code: 'COMMAND_NOT_FOUND',
              message: 'Command not found',
            },
          });
        }

        const baseResult = command.result ?? {};
        const resultWithSuccess = {
          success: command.status === 'completed',
          ...baseResult,
        } as Record<string, unknown>;

        return reply.send({
          id: command.id,
          status: command.status,
          result: resultWithSuccess,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get command');
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to get command' },
        });
      }
    }
  );
}
