import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';

import { buildApp } from '../app';

import type { FastifyInstance } from 'fastify';

describe('WebSocket Authorization Security', () => {
  let app: FastifyInstance;
  let serverUrl: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    serverUrl = `ws://localhost:${(app.server.address() as any).port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Chat Channel Subscription Authorization', () => {
    it('should reject subscription to chat session from different customer', async () => {
      // Mock Supabase auth to return a valid user
      const mockUserId = 'user-123';
      const mockCustomerId = 'customer-A';
      const otherCustomerSessionId = 'session-from-customer-B';

      // Create a WebSocket connection with a valid token
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          authorization: 'Bearer valid-token-123',
        },
      });

      await new Promise(resolve => ws.on('open', resolve));

      // Set up message listener
      const messages: any[] = [];
      ws.on('message', data => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt to subscribe to a session from a different customer
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `chat:${otherCustomerSessionId}`,
          requestId: 'test-123',
        })
      );

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that access was denied
      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.error).toContain('Access denied');

      // Verify no subscription was created
      const subscribedMessage = messages.find(m => m.type === 'subscribed');
      expect(subscribedMessage).toBeUndefined();

      ws.close();
    });

    it('should allow subscription to chat session from same customer', async () => {
      // Mock Supabase auth and database to return matching customer
      const mockUserId = 'user-123';
      const mockCustomerId = 'customer-A';
      const ownSessionId = 'session-from-customer-A';

      // Create a WebSocket connection with a valid token
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          authorization: 'Bearer valid-token-123',
        },
      });

      await new Promise(resolve => ws.on('open', resolve));

      // Set up message listener
      const messages: any[] = [];
      ws.on('message', data => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt to subscribe to own customer's session
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `chat:${ownSessionId}`,
          requestId: 'test-456',
        })
      );

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that subscription was successful
      const subscribedMessage = messages.find(m => m.type === 'subscribed');
      expect(subscribedMessage).toBeDefined();
      expect(subscribedMessage?.channel).toBe(`chat:${ownSessionId}`);

      // Verify no error was returned
      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeUndefined();

      ws.close();
    });

    it('should reject subscription when user has no customer association', async () => {
      // Mock Supabase auth to return user with no customer_id
      const mockUserId = 'user-no-customer';

      // Create a WebSocket connection with a valid token
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          authorization: 'Bearer valid-token-no-customer',
        },
      });

      await new Promise(resolve => ws.on('open', resolve));

      // Set up message listener
      const messages: any[] = [];
      ws.on('message', data => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt to subscribe to any session
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: 'chat:any-session-id',
          requestId: 'test-789',
        })
      );

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that error was returned
      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.error).toContain('not associated with a customer');

      ws.close();
    });

    it('should prevent subscription to non-existent sessions', async () => {
      // Mock valid user and customer but non-existent session
      const mockUserId = 'user-123';
      const mockCustomerId = 'customer-A';
      const nonExistentSessionId = 'session-does-not-exist';

      // Create a WebSocket connection with a valid token
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          authorization: 'Bearer valid-token-123',
        },
      });

      await new Promise(resolve => ws.on('open', resolve));

      // Set up message listener
      const messages: any[] = [];
      ws.on('message', data => {
        messages.push(JSON.parse(data.toString()));
      });

      // Attempt to subscribe to non-existent session
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `chat:${nonExistentSessionId}`,
          requestId: 'test-404',
        })
      );

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that access was denied
      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.error).toContain('Access denied');

      ws.close();
    });
  });
});
