import { getAuthenticatedSupabaseClient } from '@aizen/shared/utils/supabase-client';

import { customerAuthMiddleware } from '../middleware/customer-auth.middleware';

import type { Json } from '@aizen/shared/types/database.generated';
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
  diagnostic_data?: Json | null;
}

interface Command {
  id: string;
  status: string;
  type?: string;
  approvedBy?: string; // Individual user ID who approved the command
  [key: string]: unknown;
}

interface QueryParams {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
}

// Utility function to safely stringify errors
function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

export function registerCustomerSessionRoutes(app: FastifyInstance): void {
  // GET /api/v1/customer/sessions - List diagnostic sessions
  app.get<{ Querystring: QueryParams }>(
    '/api/v1/customer/sessions',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            limit: { type: 'string' },
            status: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const customerId = request.customerId;
      const page = parseInt(request.query.page ?? '1', 10);
      const limit = parseInt(request.query.limit ?? '10', 10);
      const status = request.query.status;
      const search = request.query.search;

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

        // Build query
        let query = supabase
          .from('diagnostic_sessions')
          .select('*', { count: 'exact' })
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });

        // Apply status filter
        if (status && status !== 'all') {
          if (status === 'pending') {
            // Include sessions with pending status or pending remediation actions
            query = query.or(
              'status.eq.pending,diagnostic_data->>remediation_actions@>[{"status":"pending_approval"}]'
            );
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            query = query.eq('status', status as any);
          }
        }

        // Apply search filter
        if (search) {
          query = query.or(
            `issue_description.ilike.%${search}%,id.ilike.%${search}%`
          );
        }

        // Apply pagination
        const start = (page - 1) * limit;
        query = query.range(start, start + limit - 1);

        const { data: sessions, count, error } = await query;

        if (error) {
          throw error;
        }

        // Get unique device and user IDs
        const deviceIds = [...new Set(sessions?.map(s => s.device_id) ?? [])];
        const userIds = [
          ...new Set(
            sessions?.filter(s => s.user_id).map(s => s.user_id) ?? []
          ),
        ];

        // Fetch devices
        let devices: Record<
          string,
          { id: string; name: string; status: string }
        > = {};
        if (deviceIds.length > 0) {
          const { data: deviceData } = await supabase
            .from('devices')
            .select('id, name, status')
            .in('id', deviceIds);

          devices =
            deviceData?.reduce(
              (acc, d) => {
                acc[d.id] = {
                  id: d.id,
                  name: d.name,
                  status: (d.status ?? 'offline') as string,
                };
                return acc;
              },
              {} as Record<string, { id: string; name: string; status: string }>
            ) ?? {};
        }

        // Fetch users
        let users: Record<string, { id: string; name: string; email: string }> =
          {};
        if (userIds.length > 0) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', userIds as string[]);

          users =
            userData?.reduce(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (acc, u: any) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                acc[u.id] = u;
                return acc;
              },
              {} as Record<string, { id: string; name: string; email: string }>
            ) ?? {};
        }

        // Format sessions with remediation_actions from diagnostic_data
        const formattedSessions =
          sessions?.map(session => {
            const diagnosticData = session.diagnostic_data as Record<
              string,
              unknown
            > | null;
            return {
              ...session,
              remediation_actions: diagnosticData?.remediation_actions ?? null,
              session_type: 'diagnostic',
            };
          }) ?? [];

        return {
          sessions: formattedSessions,
          devices,
          users,
          totalCount: count ?? 0,
          currentPage: page,
          totalPages: Math.ceil((count ?? 0) / limit),
        };
      } catch (error) {
        console.error('Failed to list diagnostic sessions:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve sessions',
            requestId: request.id,
          },
        });
      }
    }
  );

  // GET /api/v1/customer/sessions/:id/transcript - Get session transcript
  app.get<{ Params: { id: string } }>(
    '/api/v1/customer/sessions/:id/transcript',
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

        // Get session and verify ownership
        const { data: session, error } = await supabase
          .from('diagnostic_sessions')
          .select('id, customer_id, diagnostic_data')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single();

        if (error || !session) {
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

        // Extract transcript from diagnostic_data
        interface TranscriptEntry {
          timestamp?: string;
          created_at?: string;
          type?: string;
          message?: string;
          content?: string;
        }

        const diagnosticData = session.diagnostic_data as Record<
          string,
          unknown
        > | null;
        const transcript =
          (diagnosticData?.transcript as TranscriptEntry[]) ?? [];

        // Format transcript entries
        const formattedTranscript = transcript.map(entry => ({
          timestamp:
            entry.timestamp ??
            new Date(entry.created_at ?? Date.now()).toISOString(),
          type: entry.type ?? 'info',
          message: entry.message ?? entry.content ?? 'No message',
        }));

        return {
          transcript: formattedTranscript,
        };
      } catch (error) {
        console.error('Failed to get session transcript:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve transcript',
            requestId: request.id,
          },
        });
      }
    }
  );

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

  // POST /api/v1/customer/sessions/:id/approve - Approve session (simplified version)
  app.post<{ Params: { id: string }; Body: { approved: boolean } }>(
    '/api/v1/customer/sessions/:id/approve',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['approved'],
          properties: {
            approved: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { approved } = request.body;
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

        // Get current session to update diagnostic_data
        const { data: currentSession } = await supabase
          .from('diagnostic_sessions')
          .select('diagnostic_data')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single();

        const currentData =
          (currentSession?.diagnostic_data as Record<string, unknown>) ?? {};
        const updatedData = {
          ...currentData,
          approved_by: userId,
        };

        // Update session status
        const { data: updateData, error: updateError } = await supabase
          .from('diagnostic_sessions')
          .update({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            status: (approved ? 'approved' : 'rejected') as any,
            diagnostic_data: updatedData,
          })
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .select('id');

        if (updateError) {
          throw updateError;
        }

        if (!updateData || updateData.length === 0) {
          return reply.status(404).send({
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found or access denied',
              requestId: request.id,
            },
          });
        }

        // Log the approval action for audit trail
        await supabase.from('audit_logs').insert({
          customer_id: customerId,
          user_id: userId,
          action: approved ? 'approve' : 'reject',
          resource_type: 'diagnostic_session',
          resource_id: sessionId,
          ip_address: request.ip ?? null,
          user_agent: request.headers['user-agent'] ?? null,
        });

        return {
          success: true,
          status: approved ? 'approved' : 'rejected',
        };
      } catch (error) {
        console.error('Failed to approve/reject session:', error);
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

  // POST /api/v1/customer/sessions/:id/reject - Reject session with reason
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/v1/customer/sessions/:id/reject',
    {
      preHandler: [customerAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { reason } = request.body;
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

        // Get current session to update diagnostic_data
        const { data: currentSession } = await supabase
          .from('diagnostic_sessions')
          .select('diagnostic_data')
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .single();

        const currentData =
          (currentSession?.diagnostic_data as Record<string, unknown>) ?? {};
        const updatedData = {
          ...currentData,
          rejected_by: userId,
          rejection_reason: reason ?? '',
        };

        // Update session status
        const { data: updateData, error: updateError } = await supabase
          .from('diagnostic_sessions')
          .update({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            status: 'rejected' as any,
            notes: reason,
            diagnostic_data: updatedData,
          })
          .eq('id', sessionId)
          .eq('customer_id', customerId)
          .select('id');

        if (updateError) {
          throw updateError;
        }

        if (!updateData || updateData.length === 0) {
          return reply.status(404).send({
            error: {
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found or access denied',
              requestId: request.id,
            },
          });
        }

        // Log the rejection action for audit trail
        await supabase.from('audit_logs').insert({
          customer_id: customerId,
          user_id: userId,
          action: 'reject',
          resource_type: 'diagnostic_session',
          resource_id: sessionId,
          details: { rejection_reason: reason },
          ip_address: request.ip ?? null,
          user_agent: request.headers['user-agent'] ?? null,
        });

        return {
          success: true,
          status: 'rejected',
        };
      } catch (error) {
        console.error('Failed to reject session:', error);
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process rejection',
            requestId: request.id,
          },
        });
      }
    }
  );

  // POST /api/v1/customer/sessions/:id/approve-command - Approve/reject HITL commands
  app.post<{ Params: { id: string }; Body: ApproveCommandBody }>(
    '/api/v1/customer/sessions/:id/approve-command',
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
          .update({
            diagnostic_data: {
              ...((session.diagnostic_data as Record<string, unknown>) || {}),
              commands: updatedCommands,
            } as Json,
          })
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
          action: approved ? 'approve' : 'reject',
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
