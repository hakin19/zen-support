import { getAuthenticatedSupabaseClient } from '@aizen/shared/utils/supabase-client';

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

interface SessionRecord {
  id: string;
  device_id: string;
  customer_id: string;
  user_id?: string;
  status: string;
  issue_description?: string | null;
  started_at?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
  commands?: Command[] | null;
}

interface Command {
  id: string;
  status: string;
  type?: string;
  approvedBy?: string; // Individual user ID who approved the command
  [key: string]: unknown;
}

// Utility function to safely stringify errors
function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
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
        // Get the JWT token from the authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No authorization header found');
        }
        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

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
          user_id: request.userId, // Track which user created the session
          session_type: 'web', // This is a web-initiated session
          status: 'pending' as const, // Use proper enum value
          issue_description: reason,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
          started_at: new Date().toISOString(), // Add started_at timestamp
        };

        const { data: session, error: sessionError } = (await supabase
          .from('diagnostic_sessions')
          .insert(sessionData)
          .select()
          .single()) as { data: SessionRecord | null; error: unknown };

        if (sessionError ?? !session) {
          throw new Error(
            sessionError
              ? `Failed to create session: ${stringifyError(sessionError)}`
              : 'Failed to create session'
          );
        }

        const sessionRecord = session;
        return {
          session: {
            id: sessionRecord.id,
            deviceId: sessionRecord.device_id,
            status: sessionRecord.status,
            createdAt: sessionRecord.created_at,
            expiresAt: sessionRecord.expires_at,
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
        // Get the JWT token from the authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No authorization header found');
        }
        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        const { data: session, error } = (await supabase
          .from('diagnostic_sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single()) as { data: SessionRecord | null; error: unknown };

        if (error ?? !session) {
          if ((error as { code?: string })?.code === 'PGRST116') {
            return reply.status(404).send({
              error: {
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
                requestId: request.id,
              },
            });
          }
          throw new Error(
            error
              ? `Session not found: ${stringifyError(error)}`
              : 'Session not found'
          );
        }

        const sessionRecord = session;
        return {
          session: {
            id: sessionRecord.id,
            status: sessionRecord.status,
            commands: sessionRecord.commands ?? [],
            createdAt: sessionRecord.created_at,
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
      const userId = request.userId;

      if (!customerId || !userId) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid customer authentication',
            requestId: request.id,
          },
        });
      }

      try {
        // Get the JWT token from the authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No authorization header found');
        }
        const token = authHeader.replace('Bearer ', '');
        const supabase = getAuthenticatedSupabaseClient(token);

        // Get session and verify ownership
        const { data: session, error: sessionError } = (await supabase
          .from('diagnostic_sessions')
          .select('id, customer_id, commands, updated_at')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single()) as { data: SessionRecord | null; error: unknown };

        if (sessionError ?? !session) {
          if ((sessionError as { code?: string })?.code === 'PGRST116') {
            return reply.status(404).send({
              error: {
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found',
                requestId: request.id,
              },
            });
          }
          throw new Error(
            sessionError
              ? `Session not found: ${stringifyError(sessionError)}`
              : 'Session not found'
          );
        }

        // Find the command
        const sessionRecord = session;
        const commands = sessionRecord.commands ?? [];
        const command = commands.find((cmd: Command) => cmd.id === commandId);

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
        const updatedCommand: Command = {
          ...command,
          status: approved ? 'approved' : 'rejected',
          approvedAt: new Date().toISOString(),
          approvalReason: reason,
          approvedBy: userId, // Track individual user who approved
        };

        const updatedCommands = commands.map((cmd: Command) =>
          cmd.id === commandId ? updatedCommand : cmd
        );

        // Update session with new command status using optimistic concurrency control
        // Include customer_id and updated_at to prevent race conditions
        const { data: updateData, error: updateError } = await supabase
          .from('diagnostic_sessions')
          .update({ commands: updatedCommands })
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .eq('updated_at', session.updated_at)
          .select('id');

        if (updateError) {
          throw updateError;
        }

        // Verify that a row was actually updated
        if (!updateData || updateData.length === 0) {
          return reply.status(409).send({
            error: {
              code: 'CONCURRENT_UPDATE_CONFLICT',
              message: 'Session was modified by another request. Please retry.',
              requestId: request.id,
            },
          });
        }

        // Log the approval action for audit trail
        await supabase.from('audit_logs').insert({
          customer_id: customerId,
          user_id: userId,
          action: approved ? 'command_approved' : 'command_rejected',
          resource_type: 'diagnostic_command',
          resource_id: commandId,
          details: {
            session_id: sessionId,
            command_type: command.type,
            approval_reason: reason,
          },
          ip_address: request.ip ?? null,
          user_agent: request.headers['user-agent'] ?? null,
        });

        return {
          success: true,
          command: {
            id: commandId,
            status: approved ? ('approved' as const) : ('rejected' as const),
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

  // GET /api/v1/customer/system/info - Get system information
  app.get(
    '/api/v1/customer/system/info',
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
        version: process.env.API_VERSION ?? '1.0.0',
        region: process.env.AWS_REGION ?? 'us-east-1',
        environment: process.env.NODE_ENV ?? 'development',
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
