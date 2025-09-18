import { getAuthenticatedSupabaseClient } from '@aizen/shared/utils/supabase-client';

import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';

import type { Database } from '@aizen/shared';
import type { FastifyInstance } from 'fastify';

type DeviceAction = Database['public']['Tables']['device_actions']['Row'];

export function registerDeviceActionRoutes(app: FastifyInstance): void {
  /**
   * POST /api/device-actions/:id/approve
   * Approve a pending device action
   */
  app.post<{
    Params: { id: string };
  }>(
    '/api/device-actions/:id/approve',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user?.id;
      const customerId = request.customerId;

      if (!userId || !customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      try {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authorization header required',
            },
          });
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        // First, verify the device action exists and belongs to this customer
        const { data: action, error: fetchError } = await supabase
          .from('device_actions')
          .select('*, devices!inner(customer_id)')
          .eq('id', id)
          .eq('devices.customer_id', customerId)
          .single();

        if (fetchError || !action) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Device action not found',
            },
          });
        }

        // Check if action is still pending
        if (action.status !== 'pending') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STATUS',
              message: 'Action is not in pending status',
            },
          });
        }

        // Update the device action to approved status
        const { data: updatedAction, error: updateError } = await supabase
          .from('device_actions')
          .update({
            status: 'approved' as const,
            approved_by: userId,
            approved_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (updateError) {
          request.log.error(updateError, 'Failed to approve device action');
          return reply.status(500).send({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to approve action',
            },
          });
        }

        return reply.status(200).send(updatedAction);
      } catch (error) {
        request.log.error(error, 'Failed to approve device action');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to approve action',
          },
        });
      }
    }
  );

  /**
   * POST /api/device-actions/:id/reject
   * Reject a pending device action
   */
  app.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>(
    '/api/device-actions/:id/reject',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { reason } = request.body || {};
      const userId = request.user?.id;
      const customerId = request.customerId;

      if (!userId || !customerId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      try {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authorization header required',
            },
          });
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        // First, verify the device action exists and belongs to this customer
        const { data: action, error: fetchError } = await supabase
          .from('device_actions')
          .select('*, devices!inner(customer_id)')
          .eq('id', id)
          .eq('devices.customer_id', customerId)
          .single();

        if (fetchError || !action) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Device action not found',
            },
          });
        }

        // Check if action is still pending
        if (action.status !== 'pending') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STATUS',
              message: 'Action is not in pending status',
            },
          });
        }

        // Update the device action to rejected status
        const updateData: Partial<DeviceAction> = {
          status: 'rejected' as const,
          rejected_by: userId,
          rejected_at: new Date().toISOString(),
        };

        // Add rejection reason to metadata if provided
        if (reason) {
          const currentMetadata =
            (action.metadata as Record<string, unknown>) || {};
          updateData.metadata = {
            ...currentMetadata,
            rejection_reason: reason,
          };
        }

        const { data: updatedAction, error: updateError } = await supabase
          .from('device_actions')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (updateError) {
          request.log.error(updateError, 'Failed to reject device action');
          return reply.status(500).send({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to reject action',
            },
          });
        }

        return reply.status(200).send(updatedAction);
      } catch (error) {
        request.log.error(error, 'Failed to reject device action');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to reject action',
          },
        });
      }
    }
  );
}
