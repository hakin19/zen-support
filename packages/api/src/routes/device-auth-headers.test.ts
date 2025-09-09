import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createApp } from '../server';
import type { FastifyInstance } from 'fastify';

// Mock the services
vi.mock('../services/session.service');
vi.mock('../services/device-auth.service');

describe.skip('Device Auth Header Validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();

    // Mock successful session validation
    const { sessionService } = await import('../services/session.service');
    vi.mocked(sessionService.validateSession).mockResolvedValue({
      valid: true,
      deviceId: 'test-device',
      customerId: 'test-customer',
    });
    vi.mocked(sessionService.refreshSession).mockResolvedValue(true);

    // Mock device auth service
    const { deviceAuthService } = await import(
      '../services/device-auth.service'
    );
    vi.mocked(deviceAuthService.updateHeartbeat).mockResolvedValue(true);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/device/heartbeat', () => {
    it('should accept X-Device-Token header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          'x-device-token': 'valid-token',
          'content-type': 'application/json',
        },
        payload: {
          status: 'healthy',
          metrics: {
            cpu: 50,
            memory: 60,
            uptime: 3600,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('timestamp');
    });

    it('should accept Authorization Bearer header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        payload: {
          status: 'healthy',
          metrics: {
            cpu: 50,
            memory: 60,
            uptime: 3600,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('timestamp');
    });

    it('should reject requests without authentication headers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          status: 'healthy',
        },
      });

      expect(res.statusCode).toBe(401); // Middleware auth failure
      expect(res.json()).toHaveProperty('error');
    });

    it('should prefer X-Device-Token over Authorization when both present', async () => {
      const { sessionService } = await import('../services/session.service');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/device/heartbeat',
        headers: {
          'x-device-token': 'device-token',
          authorization: 'Bearer bearer-token',
          'content-type': 'application/json',
        },
        payload: {
          status: 'healthy',
        },
      });

      expect(res.statusCode).toBe(200);
      // Verify that X-Device-Token was used (not Bearer)
      expect(sessionService.validateSession).toHaveBeenCalledWith(
        'device-token'
      );
      expect(sessionService.validateSession).not.toHaveBeenCalledWith(
        'bearer-token'
      );
    });
  });
});
