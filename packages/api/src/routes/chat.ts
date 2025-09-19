import { randomUUID } from 'crypto';
import { PassThrough } from 'stream';

import { Type } from '@sinclair/typebox';

import {
  getAuthenticatedSupabaseClient,
  getSupabaseAdminClient,
} from '@aizen/shared/utils/supabase-client';

import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';
import { ClaudeCodeService } from '../services/claude-code.service';
import { publishToChannel } from '../utils/redis-pubsub';

import type { WebSocketConnectionManager } from '../services/websocket-connection-manager';
import type { Database, Json } from '@aizen/shared/types/database.generated';
import type { RedisClient } from '@aizen/shared/utils/redis-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

type SupabaseDbClient = SupabaseClient<Database>;
type ChatSessionRow = Database['public']['Tables']['chat_sessions']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

type ChatDataStore =
  | { type: 'supabase'; client: SupabaseDbClient }
  | { type: 'memory' };

const inMemorySessions = new Map<string, ChatSessionRow>();
const inMemoryMessages = new Map<string, ChatMessageRow[]>();

interface FastifyWithRedis {
  redis?: RedisClient;
}

let supabaseAvailability: 'unknown' | 'ready' | 'failed' = 'unknown';

function tryGetSupabaseClient(
  request: FastifyRequest
): SupabaseDbClient | null {
  const tokenHeader = request.headers.authorization;
  const token = tokenHeader ? tokenHeader.replace('Bearer ', '').trim() : '';

  if (token) {
    try {
      return getAuthenticatedSupabaseClient(token);
    } catch (error) {
      request.log.warn(
        { error },
        'Failed to initialize authenticated Supabase client'
      );
      return null;
    }
  }

  try {
    return getSupabaseAdminClient() as SupabaseDbClient;
  } catch (error) {
    request.log.debug(
      { error },
      'Supabase admin client unavailable; falling back to in-memory store'
    );
    return null;
  }
}

function resolveDataStore(request: FastifyRequest): ChatDataStore {
  if (supabaseAvailability === 'failed') {
    return { type: 'memory' };
  }

  const client = tryGetSupabaseClient(request);
  if (client) {
    supabaseAvailability = 'ready';
    return { type: 'supabase', client };
  }

  supabaseAvailability = 'failed';
  return { type: 'memory' };
}

function touchMemorySession(sessionId: string): void {
  const session = inMemorySessions.get(sessionId);
  if (session) {
    inMemorySessions.set(sessionId, {
      ...session,
      updated_at: new Date().toISOString(),
    });
  }
}

function getMemoryMessages(sessionId: string): ChatMessageRow[] {
  const messages = inMemoryMessages.get(sessionId);
  if (!messages) {
    const empty: ChatMessageRow[] = [];
    inMemoryMessages.set(sessionId, empty);
    return empty;
  }
  return messages;
}

function ensureMemoryMessages(sessionId: string): ChatMessageRow[] {
  const messages = inMemoryMessages.get(sessionId);
  if (messages) {
    return messages;
  }
  const empty: ChatMessageRow[] = [];
  inMemoryMessages.set(sessionId, empty);
  return empty;
}

function convertMetadata(metadata?: Record<string, unknown>): Json | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }
  return metadata as Json;
}

function createMemorySessionRecord(params: {
  userId: string;
  customerId: string;
  title?: string | null;
  metadata?: Json | null;
}): ChatSessionRow {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    user_id: params.userId,
    customer_id: params.customerId,
    title: params.title ?? null,
    status: 'active',
    metadata: params.metadata ?? null,
    created_at: now,
    updated_at: now,
    closed_at: null,
  };
}

function storeMemorySession(session: ChatSessionRow): void {
  inMemorySessions.set(session.id, session);
  ensureMemoryMessages(session.id);
}

function getMemorySessionForUser(
  sessionId: string,
  userId: string
): ChatSessionRow | undefined {
  const session = inMemorySessions.get(sessionId);
  if (session && session.user_id === userId) {
    return session;
  }
  return undefined;
}

function listMemorySessionsForUser(
  userId: string,
  status?: 'active' | 'closed' | 'archived'
): ChatSessionRow[] {
  let sessions = Array.from(inMemorySessions.values()).filter(
    session => session.user_id === userId
  );

  if (status) {
    sessions = sessions.filter(session => session.status === status);
  }

  sessions.sort((a, b) => {
    const timeA = new Date(a.updated_at ?? a.created_at ?? '').getTime();
    const timeB = new Date(b.updated_at ?? b.created_at ?? '').getTime();
    return timeB - timeA;
  });

  return sessions;
}

function cloneMemoryMessages(sessionId: string): ChatMessageRow[] {
  return [...getMemoryMessages(sessionId)].map(message => ({ ...message }));
}

function addMemoryMessage(sessionId: string, message: ChatMessageRow): void {
  const messages = ensureMemoryMessages(sessionId);
  const index = messages.findIndex(existing => existing.id === message.id);
  if (index === -1) {
    messages.push(message);
  } else {
    messages[index] = message;
  }
  touchMemorySession(sessionId);
}

// Create a wrapper for the middleware without options
const webPortalAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
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

export function registerChatRoutes(fastify: FastifyInstance): void {
  const claudeService = new ClaudeCodeService({
    model: 'sonnet',
    timeout: 60000,
  });

  const connectionManager = (
    fastify as unknown as {
      websocketConnectionManager: WebSocketConnectionManager;
    }
  ).websocketConnectionManager;

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

      const dataStore = resolveDataStore(request);

      const metadataJson = convertMetadata(metadata);

      const createMemorySession = (): FastifyReply => {
        const session = createMemorySessionRecord({
          userId,
          customerId,
          title,
          metadata: metadataJson,
        });
        storeMemorySession(session);
        return reply.code(201).send(session);
      };

      if (dataStore.type === 'memory') {
        return createMemorySession();
      }

      const supabase = dataStore.client;

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          customer_id: customerId,
          title: title ?? null,
          metadata: metadataJson,
          status: 'active',
        })
        .select()
        .single();

      if (error || !session) {
        supabaseAvailability = 'failed';
        request.log.warn({ error }, 'Supabase unavailable, using memory store');
        return createMemorySession();
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

      const dataStore = resolveDataStore(request);

      const paginate = (sessions: ChatSessionRow[]): ChatSessionRow[] =>
        sessions.slice(offset, offset + limit);

      if (dataStore.type === 'memory') {
        return reply.send(paginate(listMemorySessionsForUser(userId, status)));
      }

      const supabase = dataStore.client;

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

      if (error || !sessions) {
        supabaseAvailability = 'failed';
        request.log.warn({ error }, 'Supabase list sessions failed');
        return reply.send(paginate(listMemorySessionsForUser(userId, status)));
      }

      sessions.forEach(storeMemorySession);
      return reply.send(sessions);
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

      const dataStore = resolveDataStore(request);

      const respondWithMemory = (): FastifyReply => {
        const memorySession = getMemorySessionForUser(id, userId);
        if (!memorySession) {
          return reply.code(404).send({ error: 'Session not found' });
        }

        return reply.send({
          ...memorySession,
          messages: cloneMemoryMessages(id),
        });
      };

      if (dataStore.type === 'memory') {
        return respondWithMemory();
      }

      const supabase = dataStore.client;

      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (sessionError) {
        supabaseAvailability = 'failed';
        request.log.warn({ sessionError }, 'Supabase get session failed');
        return respondWithMemory();
      }

      if (!session) {
        return respondWithMemory();
      }

      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        supabaseAvailability = 'failed';
        request.log.warn({ messagesError }, 'Supabase get messages failed');
        return respondWithMemory();
      }

      storeMemorySession(session);
      inMemoryMessages.set(
        id,
        (messages ?? []).map(message => ({ ...message }))
      );

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

      const dataStore = resolveDataStore(request);
      const memoryStore: ChatDataStore = { type: 'memory' };
      const redis = (fastify as FastifyWithRedis).redis;
      const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
      const aiUnavailableMessage =
        'AI assistance is not configured for this environment. Please contact your administrator.';

      const saveAndBroadcastAIError = async (): Promise<void> => {
        if (dataStore.type === 'supabase') {
          const { data: errorMessage } = await dataStore.client
            .from('chat_messages')
            .insert({
              session_id: sessionId,
              role: 'error' as const,
              content: aiUnavailableMessage,
              metadata: { code: 'ANTHROPIC_NOT_CONFIGURED' } as Json,
            })
            .select()
            .single();

          if (errorMessage) {
            addMemoryMessage(sessionId, errorMessage);
          }
        } else {
          addMemoryMessage(sessionId, {
            id: randomUUID(),
            session_id: sessionId,
            role: 'error',
            content: aiUnavailableMessage,
            metadata: { code: 'ANTHROPIC_NOT_CONFIGURED' } as Json,
            created_at: new Date().toISOString(),
          });
        }

        const errorPayload = {
          type: 'chat:error',
          sessionId,
          data: {
            message: aiUnavailableMessage,
          },
        };

        await connectionManager.broadcastToCustomer(customerId, errorPayload);

        if (redis) {
          await publishToChannel(redis, `chat:${sessionId}`, errorPayload);
        }
      };

      const handleMemoryMessage = async (): Promise<FastifyReply> => {
        const session = getMemorySessionForUser(sessionId, userId);
        if (!session) {
          return reply.code(404).send({ error: 'Session not found' });
        }

        const now = new Date().toISOString();
        const userMessage: ChatMessageRow = {
          id: randomUUID(),
          session_id: sessionId,
          role: 'user',
          content,
          metadata: {} as Json,
          created_at: now,
        };

        addMemoryMessage(sessionId, userMessage);

        const messageData = {
          type: 'chat:message',
          sessionId,
          data: userMessage,
        };

        await connectionManager.broadcastToCustomer(customerId, messageData);

        if (redis) {
          await publishToChannel(redis, `chat:${sessionId}`, messageData);
        }

        if (!anthropicKey) {
          await saveAndBroadcastAIError();
          return reply.code(201).send(userMessage);
        }

        void processAIResponse(
          fastify,
          memoryStore,
          sessionId,
          content,
          userId,
          customerId
        ).catch((error: unknown) => {
          fastify.log.error(
            'Failed to process AI response: %s',
            error as Error
          );
        });

        return reply.code(201).send(userMessage);
      };

      if (dataStore.type === 'memory') {
        return handleMemoryMessage();
      }

      const supabase = dataStore.client;

      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError) {
        supabaseAvailability = 'failed';
        request.log.warn({ sessionError }, 'Supabase get session failed');
        return handleMemoryMessage();
      }

      if (!session) {
        return handleMemoryMessage();
      }

      const { data: userMessage, error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'user',
          content,
          metadata: {} as Json,
        })
        .select()
        .single();

      if (userMessageError || !userMessage) {
        supabaseAvailability = 'failed';
        request.log.warn({ userMessageError }, 'Supabase save message failed');
        return handleMemoryMessage();
      }

      storeMemorySession(session);
      addMemoryMessage(sessionId, userMessage);

      const messageData = {
        type: 'chat:message',
        sessionId,
        data: userMessage,
      };

      await connectionManager.broadcastToCustomer(customerId, messageData);

      if (redis) {
        await publishToChannel(redis, `chat:${sessionId}`, messageData);
      }

      if (!anthropicKey) {
        await saveAndBroadcastAIError();
        return reply.code(201).send(userMessage);
      }

      void processAIResponse(
        fastify,
        dataStore,
        sessionId,
        content,
        userId,
        customerId
      ).catch((error: unknown) => {
        fastify.log.error('Failed to process AI response: %s', error as Error);
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

      const dataStore = resolveDataStore(request);

      const respondWithMemory = (): FastifyReply => {
        const session = getMemorySessionForUser(sessionId, userId);
        if (!session) {
          return reply.code(404).send({ error: 'Session not found' });
        }

        const paged = cloneMemoryMessages(sessionId).slice(
          offset,
          offset + limit
        );
        return reply.send(paged);
      };

      if (dataStore.type === 'memory') {
        return respondWithMemory();
      }

      const supabase = dataStore.client;

      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError) {
        supabaseAvailability = 'failed';
        request.log.warn({ sessionError }, 'Supabase verify session failed');
        return respondWithMemory();
      }

      if (!session) {
        return respondWithMemory();
      }

      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error || !messages) {
        supabaseAvailability = 'failed';
        request.log.warn({ error }, 'Supabase list messages failed');
        return respondWithMemory();
      }

      return reply.send(messages);
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

      const dataStore = resolveDataStore(request);

      const ensureMemoryPermission = (): FastifyReply | null => {
        const session = getMemorySessionForUser(sessionId, userId);
        if (!session) {
          return reply.code(404).send({ error: 'Session not found' });
        }
        return null;
      };

      if (dataStore.type === 'memory') {
        const result = ensureMemoryPermission();
        if (result) {
          return result;
        }
      } else {
        const { data: session, error: sessionError } = await dataStore.client
          .from('chat_sessions')
          .select('id')
          .eq('id', sessionId)
          .eq('user_id', userId)
          .single();

        if (sessionError) {
          supabaseAvailability = 'failed';
          request.log.warn({ sessionError }, 'Supabase SSE auth failed');
          const result = ensureMemoryPermission();
          if (result) {
            return result;
          }
        } else if (!session) {
          const result = ensureMemoryPermission();
          if (result) {
            return result;
          }
        }
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

      const redis = (
        fastify as unknown as {
          redis?: {
            createSubscription: (
              channel: string,
              callback: (data: unknown) => void
            ) => Promise<{ unsubscribe: () => Promise<void> }>;
          };
        }
      ).redis;
      if (redis) {
        const subscription = await redis.createSubscription(
          `chat:${sessionId}`,
          (data: unknown) => {
            stream.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
          }
        );
        unsubscribe = subscription.unsubscribe;
      }

      // Clean up on disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        if (unsubscribe) {
          void unsubscribe();
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

      const dataStore = resolveDataStore(request);

      const updateMemorySession = (): FastifyReply => {
        const existing = inMemorySessions.get(sessionId);
        if (!existing || existing.user_id !== userId) {
          return reply.code(404).send({ error: 'Session not found' });
        }

        const now = new Date().toISOString();
        let closedAt = existing.closed_at;

        if (status !== undefined) {
          if (status === 'closed') {
            closedAt = now;
          } else if (status === 'active') {
            closedAt = null;
          }
        }

        const updated: ChatSessionRow = {
          ...existing,
          title: title ?? existing.title,
          status: status ?? existing.status,
          updated_at: now,
          closed_at: closedAt,
        };

        storeMemorySession(updated);
        return reply.send(updated);
      };

      if (dataStore.type === 'memory') {
        return updateMemorySession();
      }

      const supabase = dataStore.client;

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (status !== undefined) {
        updateData.status = status;
        if (status === 'closed') {
          updateData.closed_at = new Date().toISOString();
        } else if (status === 'active') {
          updateData.closed_at = null;
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
        if (error) {
          supabaseAvailability = 'failed';
          request.log.warn({ error }, 'Supabase update session failed');
        }
        return updateMemorySession();
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

      const dataStore = resolveDataStore(request);

      const archiveMemorySession = (): FastifyReply => {
        const existing = inMemorySessions.get(sessionId);
        if (!existing || existing.user_id !== userId) {
          return reply.code(404).send({ error: 'Session not found' });
        }

        const updated: ChatSessionRow = {
          ...existing,
          status: 'archived',
          updated_at: new Date().toISOString(),
        };

        storeMemorySession(updated);
        return reply.send(updated);
      };

      if (dataStore.type === 'memory') {
        return archiveMemorySession();
      }

      const supabase = dataStore.client;

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .update({ status: 'archived' })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error || !session) {
        if (error) {
          supabaseAvailability = 'failed';
          request.log.warn({ error }, 'Supabase archive session failed');
        }
        return archiveMemorySession();
      }

      return reply.send(session);
    }
  );

  // Helper function to process AI response
  async function processAIResponse(
    fastify: FastifyInstance,
    dataStore: ChatDataStore,
    sessionId: string,
    prompt: string,
    _userId: string,
    customerId: string
  ): Promise<void> {
    console.log('[processAIResponse] Starting with:', {
      dataStoreType: dataStore.type,
      sessionId,
      customerId,
    });

    let assistantMessageId: string | null = null;
    let fullResponse = '';

    // Get connection manager for WebSocket broadcasting
    const connectionManager = (
      fastify as unknown as {
        websocketConnectionManager: WebSocketConnectionManager;
      }
    ).websocketConnectionManager;

    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 500;
    let pendingUpdate = false;
    let updateTimer: NodeJS.Timeout | null = null;

    const updateDatabase = async (): Promise<void> => {
      if (!assistantMessageId || !pendingUpdate) return;

      pendingUpdate = false;
      lastUpdateTime = Date.now();

      if (dataStore.type === 'supabase') {
        await dataStore.client
          .from('chat_messages')
          .update({ content: fullResponse })
          .eq('id', assistantMessageId);

        const messages = ensureMemoryMessages(sessionId);
        const index = messages.findIndex(msg => msg.id === assistantMessageId);
        if (index !== -1 && messages[index]) {
          messages[index].content = fullResponse;
        }
      } else {
        const messages = getMemoryMessages(sessionId);
        const index = messages.findIndex(msg => msg.id === assistantMessageId);
        if (index !== -1 && messages[index]) {
          messages[index].content = fullResponse;
          touchMemorySession(sessionId);
        }
      }
    };

    const scheduleUpdate = (): void => {
      if (!assistantMessageId) return;

      pendingUpdate = true;
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;

      if (timeSinceLastUpdate >= UPDATE_INTERVAL_MS) {
        void updateDatabase();
      } else if (!updateTimer) {
        const delay = UPDATE_INTERVAL_MS - timeSinceLastUpdate;
        updateTimer = setTimeout(() => {
          updateTimer = null;
          void updateDatabase();
        }, delay);
      }
    };

    try {
      await claudeService.streamQuery(
        prompt,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (output: unknown) => {
          console.log(
            '[processAIResponse] Received output:',
            JSON.stringify(output, null, 2)
          );

          const typedOutput = output as {
            type: string;
            data?: { content?: Array<{ text?: string; type?: string }> };
          };

          if (typedOutput.type === 'message' && typedOutput.data?.content) {
            const text = typedOutput.data.content
              .map(chunk => chunk.text ?? '')
              .join('');

            if (text) {
              fullResponse += text;

              if (!assistantMessageId) {
                if (dataStore.type === 'supabase') {
                  const { data: message } = await dataStore.client
                    .from('chat_messages')
                    .insert({
                      session_id: sessionId,
                      role: 'assistant',
                      content: fullResponse,
                      metadata: {} as Json,
                    })
                    .select()
                    .single();

                  if (message) {
                    assistantMessageId = message.id;
                    lastUpdateTime = Date.now();
                    addMemoryMessage(sessionId, message);
                  }
                } else {
                  const now = new Date().toISOString();
                  const message: ChatMessageRow = {
                    id: randomUUID(),
                    session_id: sessionId,
                    role: 'assistant',
                    content: fullResponse,
                    metadata: {} as Json,
                    created_at: now,
                  };

                  const messages = getMemoryMessages(sessionId);
                  messages.push(message);
                  assistantMessageId = message.id; // THIS WAS ALREADY HERE
                  lastUpdateTime = Date.now();
                  touchMemorySession(sessionId);
                }
              } else {
                scheduleUpdate();
              }

              const messageData = {
                type: 'chat:ai_chunk',
                sessionId,
                data: {
                  messageId: assistantMessageId,
                  chunk: text,
                  fullContent: fullResponse,
                },
              };

              console.log('[processAIResponse] Broadcasting AI chunk:', {
                type: messageData.type,
                sessionId: messageData.sessionId,
                messageId: messageData.data.messageId,
                chunkLength: messageData.data.chunk.length,
                customerId,
              });

              await connectionManager.broadcastToCustomer(
                customerId,
                messageData
              );

              const redis = (fastify as FastifyWithRedis).redis;
              if (redis) {
                await publishToChannel(redis, `chat:${sessionId}`, messageData);
              }
            }
          } else if (
            typedOutput.type === 'tool_use' &&
            (typedOutput as { data?: unknown }).data
          ) {
            const toolData = {
              type: 'chat:device_action',
              sessionId,
              data: (typedOutput as { data: unknown }).data,
            };

            await connectionManager.broadcastToCustomer(customerId, toolData);

            const redis = (fastify as FastifyWithRedis).redis;
            if (redis) {
              await publishToChannel(redis, `chat:${sessionId}`, toolData);
            }
          }
        },
        {
          model: 'sonnet',
          timeout: 60000,
        }
      );

      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      if (assistantMessageId && pendingUpdate) {
        await updateDatabase();
      }
    } catch (error) {
      if (dataStore.type === 'supabase') {
        supabaseAvailability = 'failed';
      }
      fastify.log.error({ error }, 'AI processing error');

      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }

      if (dataStore.type === 'supabase') {
        const { data: errorMessage } = await dataStore.client
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            role: 'error' as const,
            content: 'Failed to process AI response. Please try again.',
            metadata: { error: String(error) } as Json,
          })
          .select()
          .single();

        if (errorMessage) {
          addMemoryMessage(sessionId, errorMessage);
        }
      } else {
        const now = new Date().toISOString();
        const message: ChatMessageRow = {
          id: randomUUID(),
          session_id: sessionId,
          role: 'error',
          content: 'Failed to process AI response. Please try again.',
          metadata: { error: String(error) } as Json,
          created_at: now,
        };

        const messages = getMemoryMessages(sessionId);
        messages.push(message);
        touchMemorySession(sessionId);
      }

      const errorData = {
        type: 'chat:error',
        sessionId,
        data: {
          message: 'Failed to process AI response',
        },
      };

      await connectionManager.broadcastToCustomer(customerId, errorData);

      const redis = (fastify as FastifyWithRedis).redis;
      if (redis) {
        await publishToChannel(redis, `chat:${sessionId}`, errorData);
      }
    }
  }
}
