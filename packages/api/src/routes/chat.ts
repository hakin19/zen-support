import { PassThrough } from 'stream';

import { Type } from '@sinclair/typebox';

import { getAuthenticatedSupabaseClient } from '@aizen/shared/utils/supabase-client';

import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';
import { ClaudeCodeService } from '../services/claude-code.service';
import { publishToChannel } from '../utils/redis-pubsub';

import type { WebSocketConnectionManager } from '../services/websocket-connection-manager';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Create a wrapper for the middleware without options
const webPortalAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  return webPortalAuthMiddleware(request, reply);
};

interface CreateSessionBody {
  title?: string;
  metadata?: Record<string, unknown>;
}

interface CreateMessageBody {
  content: string;
  stream?: boolean;
}

interface UpdateSessionBody {
  title?: string;
  status?: 'active' | 'closed' | 'archived';
}

interface SessionParams {
  id: string;
}

interface ListSessionsQuery {
  status?: 'active' | 'closed' | 'archived';
  limit?: number;
  offset?: number;
}

interface ListMessagesQuery {
  limit?: number;
  offset?: number;
}

export async function registerChatRoutes(fastify: FastifyInstance) {
  const claudeService = new ClaudeCodeService({
    model: 'sonnet',
    timeout: 60000,
  });

  const connectionManager = (fastify as any)
    .websocketConnectionManager as WebSocketConnectionManager;

  // Create a new chat session
  fastify.post<{ Body: CreateSessionBody }>(
    '/api/chat/sessions',
    {
      preHandler: [webPortalAuth],
      schema: {
        body: Type.Object({
          title: Type.Optional(Type.String()),
          metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        }),
      },
    },
    async (request, reply) => {
      const { title, metadata = {} } = request.body;
      const userId = request.userId;
      const customerId = request.customerId;

      if (!userId || !customerId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          customer_id: customerId,
          title: title || null,
          metadata: metadata as any,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to create session' });
      }

      return reply.code(201).send(session);
    }
  );

  // List chat sessions for the current user
  fastify.get<{ Querystring: ListSessionsQuery }>(
    '/api/chat/sessions',
    {
      preHandler: [webPortalAuth],
      schema: {
        querystring: Type.Object({
          status: Type.Optional(
            Type.Union([
              Type.Literal('active'),
              Type.Literal('closed'),
              Type.Literal('archived'),
            ])
          ),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
          offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const { status, limit = 20, offset = 0 } = request.query;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      let query = supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }

      const { data: sessions, error } = await query;

      if (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to list sessions' });
      }

      return reply.send(sessions || []);
    }
  );

  // Get a specific chat session with messages
  fastify.get<{ Params: SessionParams }>(
    '/api/chat/sessions/:id',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      // Get session
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (sessionError || !session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Get messages
      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        fastify.log.error(messagesError);
        return reply.code(500).send({ error: 'Failed to get messages' });
      }

      return reply.send({
        ...session,
        messages: messages || [],
      });
    }
  );

  // Create a new message in a session
  fastify.post<{ Params: SessionParams; Body: CreateMessageBody }>(
    '/api/chat/sessions/:id/messages',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          content: Type.String(),
          stream: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { content } = request.body;
      const userId = request.userId;
      const customerId = request.customerId;

      if (!userId || !customerId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      // Verify session ownership
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError || !session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Save user message
      const { data: userMessage, error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'user',
          content,
          metadata: {},
        })
        .select()
        .single();

      if (userMessageError) {
        fastify.log.error(userMessageError);
        return reply.code(500).send({ error: 'Failed to save message' });
      }

      // Broadcast user message via WebSocket and Redis
      const messageData = {
        type: 'chat:message',
        sessionId,
        data: userMessage,
      };

      // Send to customer WebSocket clients only (not devices)
      // Scoped to the specific customer for multi-tenant isolation
      await connectionManager.broadcastToCustomer(customerId, messageData);

      // Publish to Redis for multi-server fanout
      if ((fastify as any).redis) {
        await publishToChannel(
          (fastify as any).redis,
          `chat:${sessionId}`,
          messageData
        );
      }

      // Process AI response asynchronously
      processAIResponse(
        fastify,
        sessionId,
        content,
        userId,
        customerId,
        token
      ).catch(error => {
        fastify.log.error('Failed to process AI response:', error);
      });

      return reply.code(201).send(userMessage);
    }
  );

  // List messages in a session
  fastify.get<{ Params: SessionParams; Querystring: ListMessagesQuery }>(
    '/api/chat/sessions/:id/messages',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
          offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { limit = 50, offset = 0 } = request.query;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      // Verify session ownership
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to get messages' });
      }

      return reply.send(messages || []);
    }
  );

  // SSE endpoint for streaming chat messages
  fastify.get<{ Params: SessionParams }>(
    '/api/chat/sessions/:id/stream',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      // Verify session ownership
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      });

      // Create a stream for SSE
      const stream = new PassThrough();
      stream.pipe(reply.raw);

      // Send initial connection message
      stream.write('event: connected\ndata: {"status":"connected"}\n\n');

      // Set up heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        stream.write(`event: heartbeat\ndata: {"timestamp":${Date.now()}}\n\n`);
      }, 30000);

      // Subscribe to Redis channel for this session
      let unsubscribe: (() => Promise<void>) | null = null;

      if ((fastify as any).redis) {
        const subscription = await (fastify as any).redis.createSubscription(
          `chat:${sessionId}`,
          (data: any) => {
            stream.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
          }
        );
        unsubscribe = subscription.unsubscribe;
      }

      // Clean up on disconnect
      request.raw.on('close', async () => {
        clearInterval(heartbeatInterval);
        if (unsubscribe) {
          await unsubscribe();
        }
        stream.destroy();
      });

      // Hijack the response to keep the connection open
      reply.hijack();
      return reply;
    }
  );

  // Update a chat session
  fastify.patch<{ Params: SessionParams; Body: UpdateSessionBody }>(
    '/api/chat/sessions/:id',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          title: Type.Optional(Type.String()),
          status: Type.Optional(
            Type.Union([
              Type.Literal('active'),
              Type.Literal('closed'),
              Type.Literal('archived'),
            ])
          ),
        }),
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const { title, status } = request.body;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'closed') {
          updateData.closed_at = new Date().toISOString();
        }
      }

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error || !session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.send(session);
    }
  );

  // Archive (soft delete) a chat session
  fastify.delete<{ Params: SessionParams }>(
    '/api/chat/sessions/:id',
    {
      preHandler: [webPortalAuth],
      schema: {
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
        }),
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const userId = request.userId;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }
      const supabase = getAuthenticatedSupabaseClient(token);

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .update({ status: 'archived' })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error || !session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return reply.send(session);
    }
  );

  // Helper function to process AI response
  async function processAIResponse(
    fastify: FastifyInstance,
    sessionId: string,
    prompt: string,
    _userId: string,
    customerId: string,
    token: string
  ): Promise<void> {
    let assistantMessageId: string | null = null;
    let fullResponse = '';

    try {
      await claudeService.streamQuery(
        prompt,
        async (output: any) => {
          if (output.type === 'message' && output.data?.content) {
            const text = output.data.content
              .map((c: any) => c.text || '')
              .join('');

            if (text) {
              fullResponse += text;

              // Create or update assistant message
              if (!assistantMessageId) {
                const supabase = getAuthenticatedSupabaseClient(token);
                const { data: message } = await supabase
                  .from('chat_messages')
                  .insert({
                    session_id: sessionId,
                    role: 'assistant',
                    content: fullResponse,
                    metadata: {},
                  })
                  .select()
                  .single();

                if (message) {
                  assistantMessageId = message.id;
                }
              } else {
                const supabase = getAuthenticatedSupabaseClient(token);
                await supabase
                  .from('chat_messages')
                  .update({
                    content: fullResponse,
                  })
                  .eq('id', assistantMessageId);
              }

              // Broadcast via WebSocket and Redis
              const messageData = {
                type: 'chat:ai_chunk',
                sessionId,
                data: {
                  messageId: assistantMessageId,
                  chunk: text,
                  fullContent: fullResponse,
                },
              };

              // Only broadcast to connections from the same customer
              await connectionManager.broadcastToCustomer(
                customerId,
                messageData
              );

              if ((fastify as any).redis) {
                await publishToChannel(
                  (fastify as any).redis,
                  `chat:${sessionId}`,
                  messageData
                );
              }
            }
          } else if (output.type === 'tool_use' && output.data) {
            // Handle device actions
            const toolData = {
              type: 'chat:device_action',
              sessionId,
              data: output.data,
            };

            // Only broadcast to connections from the same customer
            await connectionManager.broadcastToCustomer(customerId, toolData);

            if ((fastify as any).redis) {
              await publishToChannel(
                (fastify as any).redis,
                `chat:${sessionId}`,
                toolData
              );
            }
          }
        },
        {
          model: 'sonnet',
          timeout: 60000,
        }
      );
    } catch (error) {
      fastify.log.error({ error }, 'AI processing error');

      // Save error message
      const supabase = getAuthenticatedSupabaseClient(token);
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'error' as any,
        content: 'Failed to process AI response. Please try again.',
        metadata: { error: String(error) } as any,
      });

      // Broadcast error
      const errorData = {
        type: 'chat:error',
        sessionId,
        data: {
          message: 'Failed to process AI response',
        },
      };

      // Only broadcast to connections from the same customer
      await connectionManager.broadcastToCustomer(customerId, errorData);

      if ((fastify as any).redis) {
        await publishToChannel(
          (fastify as any).redis,
          `chat:${sessionId}`,
          errorData
        );
      }
    }
  }
}
