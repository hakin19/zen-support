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
        // Generate activation code for the device - now bound to specific deviceId
        const activationCode = await deviceAuthService.createActivationCode(
          customerId,
          deviceId
        );

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

  // GET /api/v1/customer/devices - List customer's devices with pagination
  app.get<{
    Querystring: {
      limit?: string;
      cursor?: string;
    };
  }>(
    '/api/v1/customer/devices',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string', pattern: '^[1-9][0-9]*$' }, // positive integer
            cursor: { type: 'string' }, // ISO timestamp
          },
        },
      },
    },
    async (request, reply) => {
      const customerId = request.customerId;
      const { limit: limitStr, cursor } = request.query;

      // Parse and validate pagination parameters
      const limit = limitStr ? parseInt(limitStr, 10) : 50; // Default to 50
      if (limit > 200) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_LIMIT',
            message: 'Limit cannot exceed 200',
            requestId: request.id,
          },
        });
      }

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

        // Build the query with pagination
        let query = supabase
          .from('devices')
          .select('id, name, status, last_heartbeat_at, registered_at')
          .eq('customer_id', customerId)
          .order('registered_at', { ascending: false })
          .limit(limit + 1); // Fetch one extra to determine if there's a next page

        // Apply cursor if provided
        if (cursor) {
          query = query.lt('registered_at', cursor);
        }

        const { data: devices, error } = await query;

        if (error) {
          throw error;
        }

        // Determine if there are more results
        const hasMore = devices.length > limit;
        const resultDevices = hasMore ? devices.slice(0, limit) : devices;
        const nextCursor = hasMore
          ? (resultDevices[resultDevices.length - 1]?.registered_at as string)
          : null;

        // Get total count for pagination info (only if no cursor, for performance)
        let totalCount: number | undefined;
        if (!cursor) {
          const { count, error: countError } = await supabase
            .from('devices')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', customerId);

          if (!countError) {
            totalCount = count ?? 0;
          }
        }

        return {
          devices: resultDevices.map(device => ({
            id: device.id,
            name: device.name,
            status: device.status as string,
            lastSeen: device.last_heartbeat_at as string,
            createdAt: device.registered_at as string,
          })),
          pagination: {
            limit,
            hasMore,
            nextCursor,
            total: totalCount,
          },
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
