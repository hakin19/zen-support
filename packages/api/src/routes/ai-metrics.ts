import { metricsService } from '../ai/services/sdk-metrics.service';
import { extractCorrelationId } from '../utils/correlation-id';

import type { FastifyInstance } from 'fastify';

/**
 * AI Metrics Routes
 * Exposes SDK usage metrics and observability data
 */
export function aiMetricsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Get current metrics snapshot
   */
  fastify.get<{
    Querystring: {
      period?: 'minute' | 'hour' | 'day';
    };
  }>(
    '/metrics',
    {
      schema: {
        description: 'Get current SDK metrics snapshot',
        tags: ['AI Metrics'],
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
    '/metrics/history',
    {
      schema: {
        description: 'Get SDK metrics history',
        tags: ['AI Metrics'],
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
    '/metrics/prometheus',
    {
      schema: {
        description: 'Get metrics in Prometheus format',
        tags: ['AI Metrics'],
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
    '/metrics/cloudwatch',
    {
      schema: {
        description: 'Get metrics in CloudWatch format',
        tags: ['AI Metrics'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                MetricName: { type: 'string' },
                Value: { type: 'number' },
                Unit: { type: 'string' },
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

  return Promise.resolve();
}
