import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';

import type { FastifyInstance } from 'fastify';

interface CreateSessionBody {
  deviceId: string;
  reason?: string;
}

interface ApproveCommandBody {
  commandId: string;
  approved: boolean;
  reason?: string;
}

export function registerCustomerSessionRoutes(app: FastifyInstance): void {
  // POST /api/v1/customer/sessions - Create a new diagnostic session
  app.post<{ Body: CreateSessionBody }>(
    '/api/v1/customer/sessions',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId, reason } = request.body;
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
        const supabase = getSupabaseAdminClient();

        // Verify device ownership and status
        const { data: device, error: deviceError } = await supabase
          .from('devices')
          .select('id, customer_id, status')
          .eq('id', deviceId)
          .eq('customer_id', customerId)
          .single();

        if (deviceError || !device) {
          return reply.status(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Device not owned by customer',
              requestId: request.id,
            },
          });
        }

        // Check if device is online
        if (device.status !== 'online') {
          return reply.status(400).send({
            error: {
              code: 'DEVICE_OFFLINE',
              message: 'Device is not currently online',
              requestId: request.id,
            },
          });
        }

        // Create diagnostic session
        const sessionData = {
          device_id: deviceId,
          customer_id: customerId,
          status: 'active',
          reason,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
        };

        const { data: session, error: sessionError } = await supabase
          .from('diagnostic_sessions')
          .insert(sessionData)
          .select()
          .single();

        if (sessionError || !session) {
          throw sessionError || new Error('Failed to create session');
        }

        return {
          session: {
            id: session.id as string,
            deviceId: session.device_id as string,
            status: session.status as string,
            createdAt: session.created_at as string,
            expiresAt: session.expires_at as string,
          },
        };
      } catch (error) {
        console.error('Failed to create diagnostic session:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create diagnostic session',
            requestId: request.id,
          },
        });
      }
    }
  );

  // GET /api/v1/customer/sessions/:id - Get session details
  app.get<{ Params: { id: string } }>(
    '/api/v1/customer/sessions/:id',
    {
      preHandler: [customerAuthMiddleware],
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
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
        const supabase = getSupabaseAdminClient();

        const { data: session, error } = await supabase
          .from('diagnostic_sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single();

        if (error || !session) {
          if (error?.code === 'PGRST116') {
            return reply.status(404).send({
              error: {
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
                requestId: request.id,
              },
            });
          }
          throw error;
        }

        return {
          session: {
            id: session.id as string,
            status: session.status as string,
            commands: session.commands || [],
            createdAt: session.created_at as string,
          },
        };
      } catch (error) {
        console.error('Failed to get session details:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve session details',
            requestId: request.id,
          },
        });
      }
    }
  );

  // POST /api/v1/customer/sessions/:id/approve - Approve/reject HITL commands
  app.post<{ Params: { id: string }; Body: ApproveCommandBody }>(
    '/api/v1/customer/sessions/:id/approve',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['commandId', 'approved'],
          properties: {
            commandId: { type: 'string' },
            approved: { type: 'boolean' },
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { commandId, approved, reason } = request.body;
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
        const supabase = getSupabaseAdminClient();

        // Get session and verify ownership
        const { data: session, error: sessionError } = await supabase
          .from('diagnostic_sessions')
          .select('id, customer_id, commands')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single();

        if (sessionError || !session) {
          if (sessionError?.code === 'PGRST116') {
            return reply.status(404).send({
              error: {
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
                requestId: request.id,
              },
            });
          }
          throw sessionError;
        }

        // Find the command
        const commands = (session.commands as any[]) || [];
        const command = commands.find((cmd: any) => cmd.id === commandId);

        if (!command) {
          return reply.status(404).send({
            error: {
              code: 'COMMAND_NOT_FOUND',
              message: 'Command not found in session',
              requestId: request.id,
            },
          });
        }

        // Check if command is in pending state
        if (command.status !== 'pending_approval') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_COMMAND_STATE',
              message: 'Command is not pending approval',
              requestId: request.id,
            },
          });
        }

        // Update command status
        const updatedCommand = {
          ...command,
          status: approved ? 'approved' : 'rejected',
          approvedAt: new Date().toISOString(),
          approvalReason: reason,
          approvedBy: customerId,
        };

        const updatedCommands = commands.map((cmd: any) =>
          cmd.id === commandId ? updatedCommand : cmd
        );

        // Update session with new command status
        const { error: updateError } = await supabase
          .from('diagnostic_sessions')
          .update({ commands: updatedCommands })
          .eq('id', sessionId);

        if (updateError) {
          throw updateError;
        }

        return {
          success: true,
          command: {
            id: commandId,
            status: approved ? 'approved' : 'rejected',
          },
        };
      } catch (error) {
        console.error('Failed to approve/reject command:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process approval',
            requestId: request.id,
          },
        });
      }
    }
  );

  // GET /api/v1/customer/system - Get system information
  app.get(
    '/api/v1/customer/system',
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

      // Return system information
      return {
        version: process.env.API_VERSION || '1.0.0',
        region: process.env.AWS_REGION || 'us-east-1',
        environment: process.env.NODE_ENV || 'development',
        features: {
          webSockets: true,
          hitl: true,
          realTime: true,
          diagnostics: true,
        },
        limits: {
          maxSessionDuration: 3600, // seconds
          maxConcurrentSessions: 5,
          maxCommandsPerSession: 100,
        },
        support: {
          email: 'support@aizen.ai',
          documentation: 'https://docs.aizen.ai',
        },
      };
    }
  );
}
