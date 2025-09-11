import { config } from '../config';
import { deviceAuthMiddleware } from '../middleware/device-auth.middleware';
import { deviceAuthService } from '../services/device-auth.service';
import { sessionService } from '../services/session.service';

import type { FastifyInstance } from 'fastify';

interface AuthRequestBody {
  deviceId: string;
  deviceSecret: string;
}

interface RegisterRequestBody {
  deviceId: string;
  activationCode: string;
  deviceName: string;
}

interface HeartbeatRequestBody {
  status: 'healthy' | 'degraded' | 'offline';
  metrics?: {
    cpu: number;
    memory: number;
    uptime: number;
  };
}

export function registerDeviceAuthRoutes(app: FastifyInstance): void {
  // POST /api/v1/device/auth - Authenticate device with ID/secret
  app.post<{ Body: AuthRequestBody }>(
    '/api/v1/device/auth',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceId', 'deviceSecret'],
          properties: {
            deviceId: { type: 'string' },
            deviceSecret: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId, deviceSecret } = request.body;

      // Log for debugging
      if (process.env.NODE_ENV === 'test') {
        const fs = await import('fs');
        fs.appendFileSync(
          '/tmp/test-diag.log',
          `[ROUTE] Auth request for device: ${deviceId}\n`
        );
      }

      // Validate device credentials
      const result = await deviceAuthService.validateCredentials(
        deviceId,
        deviceSecret
      );

      if (!result.valid) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid device credentials',
          },
        });
      }

      // Check device status - only block maintenance devices
      // Allow offline and error devices to authenticate so they can recover
      if (result.device?.status === 'maintenance') {
        return reply.status(403).send({
          error: {
            code: 'DEVICE_MAINTENANCE',
            message: 'Device is under maintenance',
          },
        });
      }

      // Create session token
      const session = await sessionService.createSession({
        deviceId: result.device?.id as string,
        customerId: result.device?.customerId as string,
        ttl: config.device.sessionTtl,
      });

      return {
        token: session.token,
        expiresIn: config.device.sessionTtl,
        deviceId: result.device?.id as string,
      };
    }
  );

  // POST /api/v1/device/register - Register new device with activation code
  app.post<{ Body: RegisterRequestBody }>(
    '/api/v1/device/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceId', 'activationCode', 'deviceName'],
          properties: {
            deviceId: { type: 'string' },
            activationCode: { type: 'string' },
            deviceName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId, activationCode, deviceName } = request.body;

      // Validate activation code
      const validation =
        await deviceAuthService.validateActivationCode(activationCode);

      if (!validation.valid) {
        const errorCode =
          validation.reason === 'already_registered'
            ? 'DEVICE_EXISTS'
            : 'INVALID_ACTIVATION_CODE';
        const statusCode =
          validation.reason === 'already_registered' ? 409 : 400;

        return reply.status(statusCode).send({
          error: {
            code: errorCode,
            message:
              validation.reason === 'already_registered'
                ? 'Device ID already registered'
                : 'Invalid or expired activation code',
          },
        });
      }

      // SECURITY: Validate that the deviceId in the request matches the one bound to the activation code
      if (validation.deviceId && validation.deviceId !== deviceId) {
        return reply.status(403).send({
          error: {
            code: 'DEVICE_ID_MISMATCH',
            message: 'Activation code is not valid for this device ID',
          },
        });
      }

      // For enhanced security: require device-bound activation codes (new behavior)
      // Legacy codes without deviceId are still supported but logged for monitoring
      if (!validation.deviceId) {
        console.warn(
          `Legacy activation code used for device ${deviceId} - consider upgrading provision flow`
        );
      }

      try {
        // Register the device
        const result = await deviceAuthService.registerDevice({
          deviceId,
          customerId: validation.customerId as string,
          deviceName,
        });

        return reply.status(201).send({
          deviceId: result.deviceId,
          deviceSecret: result.deviceSecret,
          message: 'Device registered successfully',
        });
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'DEVICE_EXISTS'
        ) {
          return reply.status(409).send({
            error: {
              code: 'DEVICE_EXISTS',
              message:
                'message' in error && typeof error.message === 'string'
                  ? error.message
                  : 'Device already exists',
            },
          });
        }

        throw error; // Let Fastify error handler handle other errors
      }
    }
  );

  // POST /api/v1/device/heartbeat - Update device heartbeat
  app.post<{ Body: HeartbeatRequestBody }>(
    '/api/v1/device/heartbeat',
    {
      // Authenticate in preValidation so unauthenticated requests do not learn schema details
      preValidation: [deviceAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'offline', 'online'],
            },
            metrics: {
              type: 'object',
              properties: {
                cpu: { type: 'number' },
                memory: { type: 'number' },
                uptime: { type: 'number' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { status, metrics } = request.body;
      const deviceId = request.deviceId;

      // The middleware should have already validated the session
      // If deviceId is not present, the middleware failed
      if (!deviceId) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_SESSION',
            message: 'Invalid or expired session',
          },
        });
      }

      // Update heartbeat
      const success = await deviceAuthService.updateHeartbeat(deviceId, {
        status,
        metrics,
      });

      if (!success) {
        return reply.status(500).send({
          error: {
            code: 'UPDATE_FAILED',
            message: 'Failed to update heartbeat',
          },
        });
      }

      // Session TTL refresh is handled by the middleware

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    }
  );
}
