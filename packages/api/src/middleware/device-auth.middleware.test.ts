import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { deviceAuthMiddleware } from './device-auth.middleware';
import { sessionService } from '../services/session.service';

vi.mock('../services/session.service');

describe('Device Authentication Middleware', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = fastify({
      logger: false,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('deviceAuthMiddleware', () => {
    it('should pass through with valid X-Device-Token header', async () => {
      const token = 'valid-device-token';
      const mockRequest = {
        headers: {
          'x-device-token': token,
        },
        log: {
          error: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(sessionService.validateSession).toHaveBeenCalledWith(token);
      expect(mockRequest).toHaveProperty('deviceId', 'device-123');
      expect(mockRequest).toHaveProperty('customerId', 'customer-456');
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should pass through with valid Bearer token in Authorization header', async () => {
      const token = 'valid-bearer-token';
      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
        log: {
          error: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-456',
        customerId: 'customer-789',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(sessionService.validateSession).toHaveBeenCalledWith(token);
      expect(mockRequest).toHaveProperty('deviceId', 'device-456');
      expect(mockRequest).toHaveProperty('customerId', 'customer-789');
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject with 401 for invalid token', async () => {
      const mockRequest = {
        headers: {
          'x-device-token': 'invalid-token',
        },
        id: 'request-123',
      } as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: false,
        deviceId: '',
        customerId: '',
      });

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired device token',
          requestId: 'request-123',
        },
      });
    });

    it('should reject with 401 for missing authentication', async () => {
      const mockRequest = {
        headers: {},
        id: 'request-456',
      } as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(sessionService.validateSession).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Device authentication required',
          requestId: 'request-456',
        },
      });
    });

    it('should prefer X-Device-Token over Authorization header', async () => {
      const deviceToken = 'device-token';
      const bearerToken = 'bearer-token';
      const mockRequest = {
        headers: {
          'x-device-token': deviceToken,
          authorization: `Bearer ${bearerToken}`,
        },
        log: {
          error: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });

      await deviceAuthMiddleware(mockRequest, mockReply);

      // Should use X-Device-Token, not Authorization header
      expect(sessionService.validateSession).toHaveBeenCalledWith(deviceToken);
      expect(sessionService.validateSession).not.toHaveBeenCalledWith(
        bearerToken
      );
    });

    it('should handle malformed Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'NotBearer token-here',
        },
        id: 'request-789',
      } as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(sessionService.validateSession).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Device authentication required',
          requestId: 'request-789',
        },
      });
    });

    it('should refresh session TTL on successful validation', async () => {
      const token = 'valid-token';
      const mockRequest = {
        headers: {
          'x-device-token': token,
        },
        log: {
          error: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(sessionService.refreshSession).toHaveBeenCalledWith(token);
    });

    it('should handle session refresh failure gracefully', async () => {
      const token = 'valid-token';
      const mockRequest = {
        headers: {
          'x-device-token': token,
        },
        log: {
          warn: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });
      vi.mocked(sessionService.refreshSession).mockRejectedValue(
        new Error('Redis error')
      );

      await deviceAuthMiddleware(mockRequest, mockReply);

      // Should still authenticate despite refresh failure
      expect(mockRequest).toHaveProperty('deviceId', 'device-123');
      expect(mockRequest).toHaveProperty('customerId', 'customer-456');
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Error: Redis error',
          token: 'valid-to...',
        }),
        'Failed to refresh session TTL'
      );
    });

    it('should handle Redis connection errors', async () => {
      const mockRequest = {
        headers: {
          'x-device-token': 'any-token',
        },
        id: 'request-error',
        log: {
          error: vi.fn(),
        },
      } as unknown as FastifyRequest;

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      vi.mocked(sessionService.validateSession).mockRejectedValue(
        new Error('Redis connection failed')
      );

      await deviceAuthMiddleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service temporarily unavailable',
          requestId: 'request-error',
        },
      });
      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('Integration with routes', () => {
    it('should protect routes with middleware', async () => {
      // Register middleware as preHandler
      app.addHook('preHandler', deviceAuthMiddleware);

      app.get('/protected', async request => {
        return {
          deviceId: (request as any).deviceId,
          customerId: (request as any).customerId,
        };
      });

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-999',
        customerId: 'customer-111',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      const res = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-device-token': 'valid-token',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        deviceId: 'device-999',
        customerId: 'customer-111',
      });
    });

    it('should block unauthorized access to protected routes', async () => {
      app.addHook('preHandler', deviceAuthMiddleware);

      app.get('/protected', async () => {
        return { data: 'secret' };
      });

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: false,
        deviceId: '',
        customerId: '',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-device-token': 'invalid-token',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toHaveProperty('error');
      expect(res.json()).not.toHaveProperty('data');
    });
  });
});
