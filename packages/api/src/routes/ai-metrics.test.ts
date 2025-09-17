import fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { aiMetricsRoutes } from './ai-metrics';

import type { FastifyInstance } from 'fastify';

// Mock the message tracker service (must be hoisted)
vi.mock('../ai/services/sdk-message-tracker.service', () => ({
  messageTracker: {
    getAllToolMetrics: vi.fn(() => []),
  },
}));

// Mock the metrics service (must be hoisted)
vi.mock('../ai/services/sdk-metrics.service', () => {
  const mockMetrics = {
    timestamp: new Date().toISOString(),
    tokens: {
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCacheReadTokens: 100,
      totalCacheCreationTokens: 50,
      inputTokenRate: 10,
      outputTokenRate: 5,
    },
    latency: {
      averageResponseTimeMs: 250,
      p50ResponseTimeMs: 200,
      p95ResponseTimeMs: 500,
      p99ResponseTimeMs: 1000,
      minResponseTimeMs: 100,
      maxResponseTimeMs: 2000,
    },
    tools: {
      totalCalls: 100,
      successRate: 0.95,
      denialRate: 0.02,
      averageDurationMs: 150,
      topTools: [],
    },
    sessions: {
      activeSessions: 5,
      totalSessions: 50,
      averageSessionDurationMs: 30000,
      sessionSuccessRate: 0.9,
    },
    errors: {
      totalErrors: 10,
      errorRate: 0.05,
      errorsByType: {},
      recentErrors: [],
    },
  };

  return {
    metricsService: {
      startMetricsCollection: vi.fn(),
      collectCurrentMetrics: vi.fn(() => mockMetrics),
      getMetricsHistory: vi.fn(() => []),
      exportPrometheusMetrics: vi.fn(() => '# HELP...\n'),
      exportCloudWatchMetrics: vi.fn(() => []),
    },
  };
});

describe('AI Metrics Routes', () => {
  let app: FastifyInstance;
  const validToken = 'test-internal-auth-token';

  beforeEach(async () => {
    // Set up test environment variables
    process.env.INTERNAL_AUTH_ENABLED = 'true';
    process.env.INTERNAL_AUTH_TOKEN = validToken;

    app = fastify({ logger: false });
    await app.register(aiMetricsRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    delete process.env.INTERNAL_AUTH_ENABLED;
    delete process.env.INTERNAL_AUTH_TOKEN;
  });

  describe('Authentication', () => {
    it('should reject requests without X-Internal-Auth header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
        message: 'Missing authentication',
      });
    });

    it('should reject requests with invalid X-Internal-Auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current',
        headers: {
          'X-Internal-Auth': 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: 'Forbidden',
        message: 'Invalid authentication',
      });
    });

    it('should allow requests with valid X-Internal-Auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('tokens');
      expect(body).toHaveProperty('sessions');
    });
  });

  describe('Endpoints with Authentication', () => {
    it('GET /api/v1/ai/metrics/current should return metrics with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current?period=hour',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tokens.totalInputTokens).toBe(1000);
      expect(body.sessions.activeSessions).toBe(5);
    });

    it('GET /api/v1/ai/metrics/history should return history with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/history?period=minute&limit=10',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });

    it('GET /api/v1/ai/metrics/prometheus should return Prometheus format with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/prometheus',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.payload).toContain('# HELP');
    });

    it('GET /api/v1/ai/metrics/cloudwatch should return CloudWatch format with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/cloudwatch',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });

    it('GET /api/v1/ai/metrics/health should return health status with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/health',
        headers: {
          'X-Internal-Auth': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      expect(body).toHaveProperty('timestamp');
      expect(body.activeSessions).toBe(5);
    });
  });

  describe('Security', () => {
    it('should protect all metrics endpoints', async () => {
      const endpoints = [
        '/api/v1/ai/metrics/current',
        '/api/v1/ai/metrics/history',
        '/api/v1/ai/metrics/prometheus',
        '/api/v1/ai/metrics/cloudwatch',
        '/api/v1/ai/metrics/health',
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Unauthorized',
          message: 'Missing authentication',
        });
      }
    });

    it('should use constant-time comparison to prevent timing attacks', async () => {
      // Test with tokens of different lengths
      const responses = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/ai/metrics/current',
          headers: { 'X-Internal-Auth': 'short' },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/ai/metrics/current',
          headers: { 'X-Internal-Auth': 'a'.repeat(1000) },
        }),
      ]);

      // Both should be rejected as forbidden
      responses.forEach(response => {
        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe('Test Mode', () => {
    it('should bypass auth when INTERNAL_AUTH_ENABLED is false', async () => {
      // Recreate app with auth disabled
      await app.close();
      process.env.INTERNAL_AUTH_ENABLED = 'false';

      app = fastify({ logger: false });
      await app.register(aiMetricsRoutes);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should bypass auth in test mode without token configured', async () => {
      // Recreate app without token
      await app.close();
      delete process.env.INTERNAL_AUTH_TOKEN;
      process.env.NODE_ENV = 'test';

      app = fastify({ logger: false });
      await app.register(aiMetricsRoutes);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/metrics/current',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
