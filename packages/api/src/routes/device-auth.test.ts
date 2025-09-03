import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerDeviceAuthRoutes } from './device-auth';
import { deviceAuthService } from '../services/device-auth.service';
import { sessionService } from '../services/session.service';

vi.mock('../services/device-auth.service');
vi.mock('../services/session.service');

describe('Device Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = fastify({
      logger: false, // Disable logging during tests
    });
    registerDeviceAuthRoutes(app);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/device/auth', () => {
    it('should authenticate device with valid credentials', async () => {
      const deviceId = 'device-123';
      const deviceSecret = 'secret-abc';
      const sessionToken = 'session-token-xyz';

      vi.mocked(deviceAuthService.validateCredentials).mockResolvedValue({
        valid: true,
        device: {
          id: deviceId,
          customerId: 'customer-456',
          status: 'active',
        },
      });

      vi.mocked(sessionService.createSession).mockResolvedValue({
        token: sessionToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/auth',
        payload: {
          deviceId,
          deviceSecret,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        token: sessionToken,
        expiresIn: 604800, // 7 days in seconds
      });

      expect(deviceAuthService.validateCredentials).toHaveBeenCalledWith(
        deviceId,
        deviceSecret
      );
      expect(sessionService.createSession).toHaveBeenCalledWith({
        deviceId,
        customerId: 'customer-456',
        ttl: 604800,
      });
    });

    it('should return 401 for invalid credentials', async () => {
      vi.mocked(deviceAuthService.validateCredentials).mockResolvedValue({
        valid: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/auth',
        payload: {
          deviceId: 'device-123',
          deviceSecret: 'wrong-secret',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid device credentials',
        },
      });

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should return 403 for inactive device', async () => {
      vi.mocked(deviceAuthService.validateCredentials).mockResolvedValue({
        valid: true,
        device: {
          id: 'device-123',
          customerId: 'customer-456',
          status: 'inactive',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/auth',
        payload: {
          deviceId: 'device-123',
          deviceSecret: 'secret-abc',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        error: {
          code: 'DEVICE_INACTIVE',
          message: 'Device is not active',
        },
      });

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/auth',
        payload: {
          deviceId: 'device-123',
          // Missing deviceSecret
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/device/register', () => {
    it('should register device with valid activation code', async () => {
      const deviceId = 'new-device-789';
      const activationCode = 'ABCD-1234';
      const deviceSecret = 'generated-secret';

      vi.mocked(deviceAuthService.validateActivationCode).mockResolvedValue({
        valid: true,
        customerId: 'customer-456',
      });

      vi.mocked(deviceAuthService.registerDevice).mockResolvedValue({
        deviceId,
        deviceSecret,
        customerId: 'customer-456',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/register',
        payload: {
          deviceId,
          activationCode,
          deviceName: 'Office Router',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        deviceId,
        deviceSecret,
        message: 'Device registered successfully',
      });

      expect(deviceAuthService.validateActivationCode).toHaveBeenCalledWith(
        activationCode
      );
      expect(deviceAuthService.registerDevice).toHaveBeenCalledWith({
        deviceId,
        customerId: 'customer-456',
        deviceName: 'Office Router',
      });
    });

    it('should return 400 for invalid activation code', async () => {
      vi.mocked(deviceAuthService.validateActivationCode).mockResolvedValue({
        valid: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/register',
        payload: {
          deviceId: 'new-device-789',
          activationCode: 'INVALID-CODE',
          deviceName: 'Office Router',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_ACTIVATION_CODE',
          message: 'Invalid or expired activation code',
        },
      });

      expect(deviceAuthService.registerDevice).not.toHaveBeenCalled();
    });

    it('should return 409 for already registered device', async () => {
      vi.mocked(deviceAuthService.validateActivationCode).mockResolvedValue({
        valid: true,
        customerId: 'customer-456',
      });

      vi.mocked(deviceAuthService.registerDevice).mockRejectedValue({
        code: 'DEVICE_EXISTS',
        message: 'Device ID already registered',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/register',
        payload: {
          deviceId: 'existing-device',
          activationCode: 'ABCD-1234',
          deviceName: 'Office Router',
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: {
          code: 'DEVICE_EXISTS',
          message: 'Device ID already registered',
        },
      });
    });

    it('should validate activation code expiry (24h)', async () => {
      vi.mocked(deviceAuthService.validateActivationCode).mockResolvedValue({
        valid: false,
        reason: 'expired',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/register',
        payload: {
          deviceId: 'new-device-789',
          activationCode: 'EXPIRED-CODE',
          deviceName: 'Office Router',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_ACTIVATION_CODE',
          message: 'Invalid or expired activation code',
        },
      });
    });
  });

  describe('POST /api/v1/device/heartbeat', () => {
    it('should update device heartbeat with valid session', async () => {
      const sessionToken = 'valid-session-token';

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      vi.mocked(deviceAuthService.updateHeartbeat).mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'healthy',
          metrics: {
            cpu: 45,
            memory: 67,
            uptime: 86400,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        success: true,
        timestamp: expect.any(String),
      });

      expect(sessionService.validateSession).toHaveBeenCalledWith(sessionToken);
      expect(deviceAuthService.updateHeartbeat).toHaveBeenCalledWith(
        'device-123',
        {
          status: 'healthy',
          metrics: {
            cpu: 45,
            memory: 67,
            uptime: 86400,
          },
        }
      );
    });

    it('should return 401 for invalid session', async () => {
      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        payload: {
          status: 'healthy',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid or expired session',
        },
      });

      expect(deviceAuthService.updateHeartbeat).not.toHaveBeenCalled();
    });

    it('should return 401 for missing authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        // No authorization header
        payload: {
          status: 'healthy',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
      expect(sessionService.validateSession).not.toHaveBeenCalled();
    });

    it('should refresh session TTL on successful heartbeat', async () => {
      const sessionToken = 'valid-session-token';

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });

      vi.mocked(deviceAuthService.updateHeartbeat).mockResolvedValue(true);
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'healthy',
        },
      });

      expect(sessionService.refreshSession).toHaveBeenCalledWith(sessionToken);
    });

    it('should validate status enum values', async () => {
      const sessionToken = 'valid-session-token';

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'invalid-status', // Not in enum
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
    });

    it('should handle heartbeat with minimal payload', async () => {
      const sessionToken = 'valid-session-token';

      vi.mocked(sessionService.validateSession).mockResolvedValue({
        valid: true,
        deviceId: 'device-123',
        customerId: 'customer-456',
      });
      vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

      vi.mocked(deviceAuthService.updateHeartbeat).mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'healthy',
          // No metrics provided (optional)
        },
      });

      expect(res.statusCode).toBe(200);
      expect(deviceAuthService.updateHeartbeat).toHaveBeenCalledWith(
        'device-123',
        {
          status: 'healthy',
        }
      );
    });
  });
});
