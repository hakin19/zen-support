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

      // Check device status
      if (
        result.device?.status === 'inactive' ||
        result.device?.status === 'suspended'
      ) {
        return reply.status(403).send({
          error: {
            code: 'DEVICE_INACTIVE',
            message: 'Device is not active',
          },
        });
      }

      // Create session token
      const session = await sessionService.createSession({
        deviceId: result.device?.id as string,
        customerId: result.device?.customerId as string,
        ttl: 604800, // 7 days
      });

      return {
        token: session.token,
        expiresIn: 604800,
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
      preHandler: [deviceAuthMiddleware],
      schema: {
        headers: {
          type: 'object',
          required: ['authorization'],
          properties: {
            authorization: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'offline'],
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
