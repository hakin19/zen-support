import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerDeviceCommandRoutes } from './device-commands';
import { commandQueueService } from '../services/command-queue.service';
import { deviceAuthMiddleware } from '../middleware/device-auth.middleware';

vi.mock('../services/command-queue.service', () => ({
  commandQueueService: {
    claimCommands: vi.fn(),
    extendVisibility: vi.fn(),
    submitResult: vi.fn(),
  },
}));
vi.mock('../middleware/device-auth.middleware', () => ({
  deviceAuthMiddleware: vi.fn(
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Mock successful authentication
      (request as any).deviceId = 'test-device-123';
      (request as any).customerId = 'customer-456';
    }
  ),
}));

describe('Device Command Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = fastify({
      logger: false, // Disable logging during tests
    });

    registerDeviceCommandRoutes(app);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/device/commands/claim', () => {
    it('should claim pending commands with default parameters', async () => {
      const mockCommands = [
        {
          id: 'cmd-1',
          type: 'DIAGNOSTIC',
          parameters: { script: 'ping 8.8.8.8' },
          priority: 1,
          claimToken: 'claim-token-1',
          visibleUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      ];

      vi.mocked(commandQueueService.claimCommands).mockResolvedValue(
        mockCommands
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/claim',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {},
      });

      if (res.statusCode !== 200) {
        console.error('Response:', res.json());
      }
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ commands: mockCommands });

      expect(commandQueueService.claimCommands).toHaveBeenCalledWith(
        'test-device-123',
        1,
        300000 // Default 5 minutes
      );
    });

    it('should claim multiple commands with custom parameters', async () => {
      const mockCommands = [
        {
          id: 'cmd-1',
          type: 'DIAGNOSTIC',
          parameters: { script: 'ping 8.8.8.8' },
          priority: 1,
          claimToken: 'claim-token-1',
          visibleUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        {
          id: 'cmd-2',
          type: 'REBOOT',
          parameters: {},
          priority: 2,
          claimToken: 'claim-token-2',
          visibleUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ];

      vi.mocked(commandQueueService.claimCommands).mockResolvedValue(
        mockCommands
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/claim',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          limit: 5,
          visibilityTimeout: 600000, // 10 minutes - this is for claim, not extend
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ commands: mockCommands });

      expect(commandQueueService.claimCommands).toHaveBeenCalledWith(
        'test-device-123',
        5,
        600000
      );
    });

    it('should return empty array when no commands available', async () => {
      vi.mocked(commandQueueService.claimCommands).mockResolvedValue([]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/claim',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ commands: [] });
    });

    it('should validate limit parameter maximum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/claim',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          limit: 20, // Over max of 10
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(commandQueueService.claimCommands).mockRejectedValue(
        new Error('Redis connection failed')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/claim',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {},
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to claim commands',
        },
      });
    });
  });

  describe('POST /api/v1/device/commands/:id/extend', () => {
    it('should extend visibility timeout for claimed command', async () => {
      const commandId = 'cmd-123';
      const claimToken = 'claim-token-abc';
      const newVisibleUntil = new Date(
        Date.now() + 10 * 60 * 1000
      ).toISOString();

      vi.mocked(commandQueueService.extendVisibility).mockResolvedValue({
        success: true,
        visibleUntil: newVisibleUntil,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/device/commands/${commandId}/extend`,
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken,
          extensionMs: 300000, // 5 minutes (max per spec)
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        success: true,
        visibleUntil: newVisibleUntil,
      });

      expect(commandQueueService.extendVisibility).toHaveBeenCalledWith(
        commandId,
        claimToken,
        'test-device-123',
        300000 // Should match the value we sent
      );
    });

    it('should use default visibility timeout if not provided', async () => {
      const commandId = 'cmd-123';
      const claimToken = 'claim-token-abc';
      const newVisibleUntil = new Date(
        Date.now() + 5 * 60 * 1000
      ).toISOString();

      vi.mocked(commandQueueService.extendVisibility).mockResolvedValue({
        success: true,
        visibleUntil: newVisibleUntil,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/device/commands/${commandId}/extend`,
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(commandQueueService.extendVisibility).toHaveBeenCalledWith(
        commandId,
        claimToken,
        'test-device-123',
        300000 // Default 5 minutes
      );
    });

    it('should return 404 when command not found or not claimed', async () => {
      vi.mocked(commandQueueService.extendVisibility).mockResolvedValue({
        success: false,
        error: 'NOT_FOUND',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/invalid-id/extend',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'invalid-token',
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: {
          code: 'COMMAND_NOT_FOUND',
          message: 'Command not found or not claimed by this device',
        },
      });
    });

    it('should return 403 when claim token is invalid', async () => {
      vi.mocked(commandQueueService.extendVisibility).mockResolvedValue({
        success: false,
        error: 'INVALID_CLAIM',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/cmd-123/extend',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'wrong-token',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_CLAIM_TOKEN',
          message: 'Invalid or expired claim token',
        },
      });
    });
  });

  describe('POST /api/v1/device/commands/:id/result', () => {
    it('should submit command result successfully', async () => {
      const commandId = 'cmd-123';
      const claimToken = 'claim-token-abc';
      const executedAt = new Date().toISOString();

      vi.mocked(commandQueueService.submitResult).mockResolvedValue({
        success: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/device/commands/${commandId}/result`,
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken,
          status: 'success',
          output: 'Command executed successfully',
          executedAt,
          duration: 1500,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        success: true,
      });

      expect(commandQueueService.submitResult).toHaveBeenCalledWith(
        commandId,
        claimToken,
        'test-device-123',
        {
          status: 'success',
          output: 'Command executed successfully',
          executedAt,
          duration: 1500,
        }
      );
    });

    it('should submit error result', async () => {
      const commandId = 'cmd-123';
      const claimToken = 'claim-token-abc';
      const executedAt = new Date().toISOString();

      vi.mocked(commandQueueService.submitResult).mockResolvedValue({
        success: true,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/device/commands/${commandId}/result`,
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken,
          status: 'failure',
          error: 'Command failed: EXECUTION_FAILED',
          executedAt,
          duration: 500,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(commandQueueService.submitResult).toHaveBeenCalledWith(
        commandId,
        claimToken,
        'test-device-123',
        {
          status: 'failure',
          error: 'Command failed: EXECUTION_FAILED',
          executedAt,
          duration: 500,
        }
      );
    });

    it('should return 404 when command not found', async () => {
      vi.mocked(commandQueueService.submitResult).mockResolvedValue({
        success: false,
        error: 'NOT_FOUND',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/invalid-id/result',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'token',
          status: 'success',
          executedAt: new Date().toISOString(),
          duration: 1000,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: {
          code: 'COMMAND_NOT_FOUND',
          message: 'Command not found or not claimed by this device',
        },
      });
    });

    it('should return 403 when claim token is invalid', async () => {
      vi.mocked(commandQueueService.submitResult).mockResolvedValue({
        success: false,
        error: 'INVALID_CLAIM',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/cmd-123/result',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'wrong-token',
          status: 'success',
          executedAt: new Date().toISOString(),
          duration: 1000,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_CLAIM_TOKEN',
          message: 'Invalid or expired claim token',
        },
      });
    });

    it('should return 409 when command already has result', async () => {
      vi.mocked(commandQueueService.submitResult).mockResolvedValue({
        success: false,
        error: 'ALREADY_COMPLETED',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/cmd-123/result',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'token',
          status: 'success',
          executedAt: new Date().toISOString(),
          duration: 1000,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: {
          code: 'COMMAND_ALREADY_COMPLETED',
          message: 'Command has already been completed',
        },
      });
    });

    it('should validate result payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/commands/cmd-123/result',
        headers: {
          authorization: 'Bearer test-token',
        },
        payload: {
          claimToken: 'token',
          // Missing result field
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      // Re-mock to fail auth
      vi.mocked(deviceAuthMiddleware).mockImplementation(
        async (request, reply) => {
          await reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Device authentication required',
            },
          });
        }
      );

      const endpoints = [
        { method: 'POST', url: '/api/v1/device/commands/claim', payload: {} },
        {
          method: 'POST',
          url: '/api/v1/device/commands/cmd-123/extend',
          payload: { claimToken: 'test' },
        },
        {
          method: 'POST',
          url: '/api/v1/device/commands/cmd-123/result',
          payload: {
            claimToken: 'test',
            status: 'success',
            executedAt: new Date().toISOString(),
            duration: 1000,
          },
        },
      ];

      for (const endpoint of endpoints) {
        const res = await app.inject({
          method: endpoint.method as any,
          url: endpoint.url,
          payload: endpoint.payload,
        });

        expect(res.statusCode).toBe(401);
      }

      // Reset mock for other tests
      vi.mocked(deviceAuthMiddleware).mockImplementation(async request => {
        (request as any).deviceId = 'test-device-123';
        (request as any).customerId = 'customer-456';
      });
    });
  });
});
