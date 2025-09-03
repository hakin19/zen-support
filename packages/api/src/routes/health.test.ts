import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './health';
import { checkDependencies } from '../utils/dependency-checker';

vi.mock('../utils/dependency-checker');

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = fastify();
    registerHealthRoutes(app);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /healthz', () => {
    it('should return healthy status when service is running', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('should always return 200 regardless of dependency state', async () => {
      vi.mocked(checkDependencies).mockResolvedValue({
        healthy: false,
        dependencies: {
          supabase: { healthy: false, message: 'Connection failed' },
          redis: { healthy: false, message: 'Connection failed' },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /readyz', () => {
    it('should return ready when all dependencies are healthy', async () => {
      vi.mocked(checkDependencies).mockResolvedValue({
        healthy: true,
        dependencies: {
          supabase: { healthy: true, message: 'Connected' },
          redis: { healthy: true, message: 'Connected' },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toEqual({
        ready: true,
        dependencies: {
          supabase: { healthy: true, message: 'Connected' },
          redis: { healthy: true, message: 'Connected' },
        },
      });
    });

    it('should return 503 when any dependency is unhealthy', async () => {
      vi.mocked(checkDependencies).mockResolvedValue({
        healthy: false,
        dependencies: {
          supabase: { healthy: true, message: 'Connected' },
          redis: { healthy: false, message: 'Connection timeout' },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      expect(res.statusCode).toBe(503);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toEqual({
        ready: false,
        dependencies: {
          supabase: { healthy: true, message: 'Connected' },
          redis: { healthy: false, message: 'Connection timeout' },
        },
      });
    });

    it('should handle dependency check errors gracefully', async () => {
      vi.mocked(checkDependencies).mockRejectedValue(
        new Error('Unexpected error')
      );

      const res = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        ready: false,
        error: 'Failed to check dependencies',
      });
    });
  });

  describe('GET /version', () => {
    it('should return API version from environment', async () => {
      const originalVersion = process.env.APP_VERSION;
      process.env.APP_VERSION = '1.2.3';

      const res = await app.inject({
        method: 'GET',
        url: '/version',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toEqual({
        version: '1.2.3',
      });

      process.env.APP_VERSION = originalVersion;
    });

    it('should return default version when environment variable is not set', async () => {
      const originalVersion = process.env.APP_VERSION;
      delete process.env.APP_VERSION;

      const res = await app.inject({
        method: 'GET',
        url: '/version',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        version: '0.0.1',
      });

      if (originalVersion) {
        process.env.APP_VERSION = originalVersion;
      }
    });

    it('should not expose sensitive information', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/version',
      });

      const body = res.json();
      expect(body).not.toHaveProperty('nodeVersion');
      expect(body).not.toHaveProperty('environment');
      expect(body).not.toHaveProperty('hostname');
      expect(body).not.toHaveProperty('apiKeys');
    });
  });

  describe('GET /system/info', () => {
    it('should return 401 when no authentication is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/system/info',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    });

    it('should return system info for authenticated requests', async () => {
      // This will be implemented when auth middleware is added
      // For now, we're testing that the route exists and requires auth
    });
  });
});
