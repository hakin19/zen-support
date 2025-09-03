import type { FastifyInstance } from 'fastify';

// Stub implementation for device authentication routes
// TODO: Complete implementation with actual services

export function registerDeviceAuthRoutes(app: FastifyInstance): void {
  // POST /api/v1/device/auth - Authenticate device with ID/secret
  app.post(
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
      // TODO: Implement device authentication logic
      return reply.status(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Device authentication not yet implemented',
        },
      });
    }
  );

  // POST /api/v1/device/register - Register new device with activation code
  app.post(
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
      // TODO: Implement device registration logic
      return reply.status(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Device registration not yet implemented',
        },
      });
    }
  );

  // POST /api/v1/device/heartbeat - Update device heartbeat
  app.post(
    '/api/v1/device/heartbeat',
    {
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
      // TODO: Implement heartbeat logic
      return reply.status(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Device heartbeat not yet implemented',
        },
      });
    }
  );
}
