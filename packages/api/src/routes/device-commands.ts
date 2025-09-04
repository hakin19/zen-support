import { deviceAuthMiddleware } from '../middleware/device-auth.middleware';
import { commandQueueService } from '../services/command-queue.service';

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
}
