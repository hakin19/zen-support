import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';
import { deviceAuthService } from '../services/device-auth.service';

import type { FastifyInstance } from 'fastify';

interface ProvisionDeviceBody {
  deviceId: string;
  deviceName?: string;
}

export function registerCustomerDeviceRoutes(app: FastifyInstance): void {
  // POST /api/v1/customer/devices/provision - Pre-provision a device
  app.post<{ Body: ProvisionDeviceBody }>(
    '/api/v1/customer/devices/provision',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string' },
            deviceName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId } = request.body;
      const customerId = request.customerId;

      if (!customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid customer authentication',
            requestId: request.id,
          },
        });
      }

      try {
        // Generate activation code for the device
        const activationCode =
          await deviceAuthService.createActivationCode(customerId);

        // Calculate expiry time (24 hours from now)
        const expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString();

        return {
          device: {
            id: deviceId,
            activationCode,
            expiresAt,
          },
          instructions: `Provide the activation code "${activationCode}" to the device during setup. This code expires in 24 hours.`,
        };
      } catch (error) {
        console.error('Failed to generate activation code:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate activation code',
            requestId: request.id,
          },
        });
      }
    }
  );

  // GET /api/v1/customer/devices - List customer's devices
  app.get(
    '/api/v1/customer/devices',
    {
      preHandler: [customerAuthMiddleware],
    },
    async (request, reply) => {
      const customerId = request.customerId;

      if (!customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid customer authentication',
            requestId: request.id,
          },
        });
      }

      try {
        const { getAuthenticatedSupabaseClient } = await import(
          '@aizen/shared/utils/supabase-client'
        );
        // Get the JWT token from the authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No authorization header found');
        }
        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        const { data: devices, error } = await supabase
          .from('devices')
          .select('id, name, status, last_seen, created_at')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        return {
          devices: devices.map(device => ({
            id: device.id as string,
            name: device.name as string,
            status: device.status as string,
            lastSeen: device.last_seen as string,
            createdAt: device.created_at as string,
          })),
          total: devices.length,
        };
      } catch (error) {
        console.error('Failed to list customer devices:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve devices',
            requestId: request.id,
          },
        });
      }
    }
  );

  // GET /api/v1/customer/devices/:id/status - Get specific device status
  app.get<{ Params: { id: string } }>(
    '/api/v1/customer/devices/:id/status',
    {
      preHandler: [customerAuthMiddleware],
    },
    async (request, reply) => {
      const { id: deviceId } = request.params;
      const customerId = request.customerId;

      if (!customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid customer authentication',
            requestId: request.id,
          },
        });
      }

      try {
        const { getAuthenticatedSupabaseClient } = await import(
          '@aizen/shared/utils/supabase-client'
        );
        // Get the JWT token from the authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No authorization header found');
        }
        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        const { data: device, error } = await supabase
          .from('devices')
          .select('id, name, status, last_seen, created_at, metrics')
          .eq('id', deviceId)
          .eq('customer_id', customerId)
          .single();

        if (error || !device) {
          if (error?.code === 'PGRST116') {
            return reply.status(404).send({
              error: {
                code: 'DEVICE_NOT_FOUND',
                message: 'Device not found',
                requestId: request.id,
              },
            });
          }
          throw error;
        }

        return {
          device: {
            id: device.id as string,
            name: device.name as string,
            status: device.status as string,
            lastHeartbeat: device.last_seen as string,
            metrics: device.metrics as Record<string, unknown>,
            createdAt: device.created_at as string,
          },
        };
      } catch (error) {
        console.error('Failed to get device status:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve device status',
            requestId: request.id,
          },
        });
      }
    }
  );
}
