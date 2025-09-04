import { deviceAuthMiddleware } from '../middleware/device-auth.middleware';
import { commandQueueService } from '../services/command-queue.service';

import type { FastifyInstance } from 'fastify';

interface ClaimBody {
  limit?: number;
  visibilityTimeout?: number;
}

interface ExtendBody {
  claimToken: string;
  visibilityTimeout?: number;
}

interface ResultBody {
  claimToken: string;
  result: Record<string, unknown>;
}

/**
 * Sanitize result object to prevent deeply nested structures
 * that could cause memory/storage issues
 */
function sanitizeResult(
  obj: Record<string, unknown>,
  maxDepth: number = 5,
  currentDepth: number = 0
): Record<string, unknown> {
  if (currentDepth >= maxDepth) {
    return { _truncated: 'Max depth exceeded' };
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Limit key length to prevent abuse
    const sanitizedKey = key.substring(0, 100);

    if (value === null || value === undefined) {
      sanitized[sanitizedKey] = value;
    } else if (typeof value === 'string') {
      // Limit string length
      sanitized[sanitizedKey] = value.substring(0, 10000);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      // Limit array size and recursively sanitize items
      sanitized[sanitizedKey] = value.slice(0, 100).map((item): unknown => {
        if (typeof item === 'object' && item !== null) {
          return sanitizeResult(
            item as Record<string, unknown>,
            maxDepth,
            currentDepth + 1
          );
        }
        if (typeof item === 'string') {
          return item.substring(0, 1000);
        }
        return item;
      });
    } else if (typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[sanitizedKey] = sanitizeResult(
        value as Record<string, unknown>,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  return sanitized;
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

        const { claimToken, visibilityTimeout = 300000 } = request.body;
        const commandId = request.params.id;

        const result = await commandQueueService.extendVisibility(
          commandId,
          claimToken,
          request.deviceId,
          visibilityTimeout
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
          visibleUntil: result.visibleUntil,
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
          required: ['claimToken', 'result'],
          properties: {
            claimToken: { type: 'string' },
            result: {
              type: 'object',
              // Limit result object depth and size
              maxProperties: 100, // Max 100 properties in result
              additionalProperties: true, // Allow flexible structure but size is limited by bodyLimit
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

        const { claimToken, result } = request.body;
        const commandId = request.params.id;

        // Sanitize result to prevent deeply nested/large objects
        const sanitizedResult = sanitizeResult(result);

        const submitResult = await commandQueueService.submitResult(
          commandId,
          claimToken,
          request.deviceId,
          sanitizedResult
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
