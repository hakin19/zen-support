import { messageTracker } from '../ai/services/sdk-message-tracker.service';
import { metricsService } from '../ai/services/sdk-metrics.service';
import { internalAuthHook } from '../middleware/internal-auth.middleware';
import { extractCorrelationId } from '../utils/correlation-id';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * AI Metrics Routes
 * Exposes SDK usage metrics and observability data
 */
/* eslint-disable @typescript-eslint/no-misused-promises */
export const aiMetricsRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Start metrics collection when routes are registered (production only)
  if (process.env.NODE_ENV !== 'test') {
    metricsService.startMetricsCollection();
    messageTracker.startCleanupInterval();
  }

  /**
   * Get current metrics snapshot
   */
  fastify.get<{
    Querystring: {
      period?: 'minute' | 'hour' | 'day';
    };
  }>(
    '/api/v1/ai/metrics/current',
    {
      preHandler: internalAuthHook,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['minute', 'hour', 'day'],
              default: 'minute',
              description: 'Time period for metrics aggregation',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              tokens: {
                type: 'object',
                properties: {
                  totalInputTokens: { type: 'number' },
                  totalOutputTokens: { type: 'number' },
                  totalCacheReadTokens: { type: 'number' },
                  totalCacheCreationTokens: { type: 'number' },
                  inputTokenRate: { type: 'number' },
                  outputTokenRate: { type: 'number' },
                },
              },
              latency: {
                type: 'object',
                properties: {
                  averageResponseTimeMs: { type: 'number' },
                  p50ResponseTimeMs: { type: 'number' },
                  p95ResponseTimeMs: { type: 'number' },
                  p99ResponseTimeMs: { type: 'number' },
                  minResponseTimeMs: { type: 'number' },
                  maxResponseTimeMs: { type: 'number' },
                },
              },
              tools: {
                type: 'object',
                properties: {
                  totalCalls: { type: 'number' },
                  successRate: { type: 'number' },
                  denialRate: { type: 'number' },
                  averageDurationMs: { type: 'number' },
                  topTools: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        calls: { type: 'number' },
                        successRate: { type: 'number' },
                      },
                    },
                  },
                },
              },
              sessions: {
                type: 'object',
                properties: {
                  activeSessions: { type: 'number' },
                  totalSessions: { type: 'number' },
                  averageSessionDurationMs: { type: 'number' },
                  sessionSuccessRate: { type: 'number' },
                },
              },
              errors: {
                type: 'object',
                properties: {
                  totalErrors: { type: 'number' },
                  errorRate: { type: 'number' },
                  errorsByType: { type: 'object' },
                  recentErrors: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
    (request, reply) => {
      try {
        const period = request.query.period ?? 'minute';
        const metrics = metricsService.collectCurrentMetrics(period);

        request.log.info(
          {
            correlationId: extractCorrelationId(request),
            period,
            activeSessions: metrics.sessions.activeSessions,
          },
          'Retrieved current metrics snapshot'
        );

        return reply.send(metrics);
      } catch (error) {
        request.log.error({ error }, 'Failed to retrieve current metrics');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get metrics history
   */
  fastify.get<{
    Querystring: {
      period?: 'minute' | 'hour' | 'day';
      limit?: number;
    };
  }>(
    '/api/v1/ai/metrics/history',
    {
      preHandler: internalAuthHook,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['minute', 'hour', 'day'],
              default: 'minute',
              description: 'Time period for metrics aggregation',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              default: 100,
              description: 'Maximum number of historical entries',
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                tokens: { type: 'object' },
                latency: { type: 'object' },
                tools: { type: 'object' },
                sessions: { type: 'object' },
                errors: { type: 'object' },
              },
            },
          },
        },
      },
    },
    (request, reply) => {
      try {
        const period = request.query.period ?? 'minute';
        const limit = request.query.limit ?? 100;
        const history = metricsService.getMetricsHistory(period, limit);

        request.log.info(
          {
            correlationId: extractCorrelationId(request),
            period,
            limit,
            count: history.length,
          },
          'Retrieved metrics history'
        );

        return reply.send(history);
      } catch (error) {
        request.log.error({ error }, 'Failed to retrieve metrics history');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get Prometheus metrics
   */
  fastify.get(
    '/api/v1/ai/metrics/prometheus',
    {
      preHandler: internalAuthHook,
      schema: {
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics format',
          },
        },
      },
    },
    (request, reply) => {
      try {
        const prometheusMetrics = metricsService.exportPrometheusMetrics();

        request.log.info(
          {
            correlationId: extractCorrelationId(request),
          },
          'Exported Prometheus metrics'
        );

        return reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .send(prometheusMetrics);
      } catch (error) {
        request.log.error({ error }, 'Failed to export Prometheus metrics');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get CloudWatch metrics
   */
  fastify.get(
    '/api/v1/ai/metrics/cloudwatch',
    {
      preHandler: internalAuthHook,
      schema: {
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                MetricName: { type: 'string' },
                Value: { type: 'number' },
                Unit: { type: 'string' },
                Timestamp: { type: 'string', format: 'date-time' },
                Dimensions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      Name: { type: 'string' },
                      Value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    (request, reply) => {
      try {
        const cloudWatchMetrics = metricsService.exportCloudWatchMetrics();

        request.log.info(
          {
            correlationId: extractCorrelationId(request),
            metricsCount: cloudWatchMetrics.length,
          },
          'Exported CloudWatch metrics'
        );

        return reply.send(cloudWatchMetrics);
      } catch (error) {
        request.log.error({ error }, 'Failed to export CloudWatch metrics');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get health status of metrics service
   */
  fastify.get(
    '/api/v1/ai/metrics/health',
    {
      preHandler: internalAuthHook,
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy'] },
              timestamp: { type: 'string', format: 'date-time' },
              activeSessions: { type: 'number' },
            },
          },
        },
      },
    },
    (request, reply) => {
      try {
        const metrics = metricsService.collectCurrentMetrics('minute');

        const healthStatus = {
          status: 'healthy' as const,
          timestamp: new Date().toISOString(),
          activeSessions: metrics.sessions.activeSessions,
        };

        request.log.info(
          {
            correlationId: extractCorrelationId(request),
            activeSessions: healthStatus.activeSessions,
          },
          'Health check performed'
        );

        return reply.send(healthStatus);
      } catch (error) {
        request.log.error({ error }, 'Failed to check health status');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  return Promise.resolve();
};
/* eslint-enable @typescript-eslint/no-misused-promises */
