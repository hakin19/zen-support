import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

import { createApp } from '../../server';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';
import { initRedis } from '@aizen/shared/utils/redis-client';
import { ClaudeCodeService } from '../../services/claude-code.service';

vi.mock('../../services/claude-code.service');

describe.skip('Chat API Tests', () => {
  let app: FastifyInstance;
  let ws: WebSocket | null = null;
  let authToken: string;
  let sessionId: string;
  let customerId: string;
  let userId: string;
  const supabase = getSupabaseAdminClient();

  beforeAll(async () => {
    // Build the app
    app = await createApp();
    await app.ready();

    // Create test user and authenticate
    const email = `test-chat-${Date.now()}@example.com`;
    const password = 'Test123!@#';

    // Create user with admin API
    const { data: userData, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !userData.user) {
      throw new Error(`Failed to create test user: ${createError?.message}`);
    }

    userId = userData.user.id;

    // Generate access token for the user
    const { data: tokenData, error: tokenError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

    // For testing, we'll create a mock token
    // In a real test environment, you would use the actual auth flow
    authToken = 'test-token-' + userId;

    // Create test customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        name: 'Test Chat Customer',
        email,
        subscription_status: 'active',
        subscription_tier: 'professional',
      })
      .select()
      .single();

    if (customerError || !customer) {
      throw new Error(
        `Failed to create test customer: ${customerError?.message}`
      );
    }

    customerId = customer.id;

    // Link user to customer
    await supabase.from('user_roles').insert({
      user_id: userId,
      customer_id: customerId,
      role: 'owner',
    });
  });

  afterAll(async () => {
    // Cleanup WebSocket
    if (ws) {
      ws.close();
      ws = null;
    }

    // Cleanup test data
    if (customerId) {
      await supabase.from('customers').delete().eq('id', customerId);
    }

    if (userId) {
      await supabase.auth.admin.deleteUser(userId);
    }

    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/chat/sessions', () => {
    it('should create a new chat session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/sessions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          title: 'Test Chat Session',
          metadata: { device_id: 'test-device-001' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('Test Chat Session');
      expect(body.customer_id).toBe(customerId);
      expect(body.user_id).toBe(userId);
      expect(body.status).toBe('active');

      sessionId = body.id;
    });

    it('should auto-generate title if not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/sessions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          metadata: { device_id: 'test-device-002' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body.title).toBeNull(); // Will be set on first message
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/sessions',
        payload: {
          title: 'Test Session',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/chat/sessions', () => {
    it('should list user chat sessions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/sessions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('title');
      expect(body[0]).toHaveProperty('status');
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/sessions?status=active',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      body.forEach((session: any) => {
        expect(session.status).toBe('active');
      });
    });
  });

  describe('GET /api/chat/sessions/:id', () => {
    it('should get a specific chat session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(sessionId);
      expect(body).toHaveProperty('messages');
      expect(Array.isArray(body.messages)).toBe(true);
    });

    it('should return 404 for non-existent session', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${fakeId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/chat/sessions/:id/messages', () => {
    it('should add a message to a session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Hello AI, can you help me?',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body.session_id).toBe(sessionId);
      expect(body.role).toBe('user');
      expect(body.content).toBe('Hello AI, can you help me?');
    });

    it('should trigger AI response for user messages', async () => {
      const mockStreamQuery = vi
        .fn()
        .mockImplementation(async (prompt, onMessage) => {
          // Simulate streaming response
          await onMessage({
            type: 'message',
            data: { content: [{ text: 'Sure, I can help you!' }] },
          });
        });

      (ClaudeCodeService as any).mockImplementation(() => ({
        streamQuery: mockStreamQuery,
      }));

      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'What is the network status?',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockStreamQuery).toHaveBeenCalled();
    });
  });

  describe('GET /api/chat/sessions/:id/messages', () => {
    it('should list messages in a session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      body.forEach((message: any) => {
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('role');
        expect(message).toHaveProperty('content');
        expect(message.session_id).toBe(sessionId);
      });
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}/messages?limit=10&offset=0`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(10);
    });
  });

  describe('SSE /api/chat/sessions/:id/stream', () => {
    it('should stream messages via SSE', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}/stream`,
        headers: {
          authorization: `Bearer ${authToken}`,
          accept: 'text/event-stream',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    it('should send heartbeat events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}/stream`,
        headers: {
          authorization: `Bearer ${authToken}`,
          accept: 'text/event-stream',
        },
      });

      const body = response.payload;
      expect(body).toContain('event: heartbeat');
    });
  });

  describe('PATCH /api/chat/sessions/:id', () => {
    it('should update session status', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/chat/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          status: 'closed',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('closed');
      expect(body.closed_at).toBeTruthy();
    });

    it('should update session title', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/chat/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          title: 'Updated Chat Title',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Chat Title');
    });
  });

  describe('DELETE /api/chat/sessions/:id', () => {
    it('should archive a chat session', async () => {
      // Create a session to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/chat/sessions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          title: 'Session to Archive',
        },
      });

      const { id } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/chat/sessions/${id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('archived');
    });
  });

  describe('WebSocket Chat Integration', () => {
    it('should establish WebSocket connection for chat', done => {
      const wsUrl = `ws://localhost:${app.server.address()?.port || 3000}/ws`;
      ws = new WebSocket(wsUrl, {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      ws.on('open', () => {
        expect(ws?.readyState).toBe(WebSocket.OPEN);
        done();
      });

      ws.on('error', err => {
        done(err);
      });
    });

    it('should receive chat messages via WebSocket', done => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        done(new Error('WebSocket not connected'));
        return;
      }

      // Subscribe to chat session
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `chat:${sessionId}`,
        })
      );

      ws.on('message', data => {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribed') {
          expect(message.channel).toBe(`chat:${sessionId}`);
          done();
        }
      });
    });

    it('should broadcast new messages to WebSocket clients', done => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        done(new Error('WebSocket not connected'));
        return;
      }

      let messageReceived = false;

      ws.on('message', data => {
        const message = JSON.parse(data.toString());
        if (message.type === 'chat:message' && !messageReceived) {
          messageReceived = true;
          expect(message.data).toHaveProperty('content');
          expect(message.data).toHaveProperty('role');
          done();
        }
      });

      // Send a message that should be broadcast
      app
        .inject({
          method: 'POST',
          url: `/api/chat/sessions/${sessionId}/messages`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            content: 'Test broadcast message',
          },
        })
        .catch(err => done(err));
    });

    it('should handle WebSocket ping/pong', done => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        done(new Error('WebSocket not connected'));
        return;
      }

      ws.on('pong', () => {
        done();
      });

      ws.ping();
    });

    it('should handle WebSocket reconnection', done => {
      if (!ws) {
        done(new Error('WebSocket not initialized'));
        return;
      }

      // Force close the connection
      ws.close();

      // Attempt reconnection
      const wsUrl = `ws://localhost:${app.server.address()?.port || 3000}/ws`;
      const newWs = new WebSocket(wsUrl, {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      newWs.on('open', () => {
        expect(newWs.readyState).toBe(WebSocket.OPEN);
        ws = newWs;
        done();
      });

      newWs.on('error', err => {
        done(err);
      });
    });
  });

  describe('Redis Pub/Sub for Chat', () => {
    it('should publish chat messages to Redis', async () => {
      const redis = await initRedis();
      const publishSpy = vi.spyOn(redis, 'publish');

      await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Test Redis pub/sub',
        },
      });

      expect(publishSpy).toHaveBeenCalledWith(
        expect.stringContaining(`chat:${sessionId}`),
        expect.any(String)
      );
    });

    it('should handle multi-server chat fanout', async () => {
      const redis = await initRedis();
      const subscribeSpy = vi.spyOn(redis, 'subscribe');

      // Simulate another server subscribing
      await redis.subscribe(`chat:${sessionId}`, message => {
        const data = JSON.parse(message);
        expect(data).toHaveProperty('content');
      });

      expect(subscribeSpy).toHaveBeenCalledWith(
        `chat:${sessionId}`,
        expect.any(Function)
      );
    });
  });

  describe('Claude Code SDK Streaming', () => {
    it('should stream AI responses', async () => {
      const mockStreamQuery = vi
        .fn()
        .mockImplementation(async (prompt, onMessage) => {
          // Simulate streaming chunks
          await onMessage({ type: 'start', data: {} });
          await onMessage({
            type: 'message',
            data: { content: [{ text: 'Analyzing your request...' }] },
          });
          await onMessage({
            type: 'message',
            data: {
              content: [{ text: 'The network appears to be functioning.' }],
            },
          });
          await onMessage({ type: 'end', data: {} });
        });

      (ClaudeCodeService as any).mockImplementation(() => ({
        streamQuery: mockStreamQuery,
      }));

      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Check network connectivity',
          stream: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockStreamQuery).toHaveBeenCalledWith(
        expect.stringContaining('Check network connectivity'),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should handle device actions in AI responses', async () => {
      const mockStreamQuery = vi
        .fn()
        .mockImplementation(async (prompt, onMessage) => {
          await onMessage({
            type: 'tool_use',
            data: {
              name: 'device_action',
              input: {
                action: 'ping',
                parameters: { target: '8.8.8.8' },
              },
            },
          });
        });

      (ClaudeCodeService as any).mockImplementation(() => ({
        streamQuery: mockStreamQuery,
        setApprovalHandler: vi.fn(),
      }));

      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Test network connectivity to Google DNS',
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('Error Handling', () => {
    it('should handle Claude Code SDK errors gracefully', async () => {
      const mockStreamQuery = vi
        .fn()
        .mockRejectedValue(new Error('Claude Code SDK error'));

      (ClaudeCodeService as any).mockImplementation(() => ({
        streamQuery: mockStreamQuery,
      }));

      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'This will fail',
        },
      });

      expect(response.statusCode).toBe(201); // Message is created
      // Error message should be saved
      const messages = await app.inject({
        method: 'GET',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const body = JSON.parse(messages.body);
      const errorMessage = body.find((m: any) => m.role === 'error');
      expect(errorMessage).toBeTruthy();
    });

    it('should handle WebSocket connection errors', done => {
      const wsUrl = `ws://localhost:${app.server.address()?.port || 3000}/ws`;
      const badWs = new WebSocket(wsUrl); // No auth header

      badWs.on('error', () => {
        expect(badWs.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      badWs.on('close', code => {
        expect(code).toBe(1008); // Policy violation
        done();
      });
    });

    it('should handle Redis connection failures', async () => {
      const redis = await initRedis();
      const originalPublish = redis.publish;
      redis.publish = vi.fn().mockRejectedValue(new Error('Redis error'));

      const response = await app.inject({
        method: 'POST',
        url: `/api/chat/sessions/${sessionId}/messages`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Test with Redis failure',
        },
      });

      // Should still work even if Redis fails
      expect(response.statusCode).toBe(201);

      redis.publish = originalPublish;
    });
  });
});
