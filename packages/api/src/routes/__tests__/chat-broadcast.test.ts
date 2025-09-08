import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { WebSocketConnectionManager } from '../../services/websocket-connection-manager';

describe('Chat broadcast isolation', () => {
  let connectionManager: WebSocketConnectionManager;

  beforeEach(() => {
    connectionManager = new WebSocketConnectionManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should only broadcast to customer connections, not device connections', async () => {
    // Mock WebSocket connections
    const customerWs = {
      readyState: 1, // OPEN
      send: vi.fn((_, callback) => callback?.()), // Call callback immediately
      bufferedAmount: 0,
      on: vi.fn(),
    };

    const deviceWs = {
      readyState: 1, // OPEN
      send: vi.fn((_, callback) => callback?.()), // Call callback immediately
      bufferedAmount: 0,
      on: vi.fn(),
    };

    // Add connections with different types
    connectionManager.addConnection('customer-1', customerWs as any, {
      type: 'customer',
      customerId: 'cust-123',
      customerEmail: 'test@example.com',
    });

    connectionManager.addConnection('device-1', deviceWs as any, {
      type: 'device',
      deviceId: 'device-456',
    });

    // Test data
    const messageData = {
      type: 'chat:message',
      sessionId: 'session-789',
      data: { content: 'Test message' },
    };

    // Broadcast to customer type only
    await connectionManager.broadcastToType('customer', messageData);

    // Verify customer received the message
    expect(customerWs.send).toHaveBeenCalledWith(
      JSON.stringify(messageData),
      expect.any(Function)
    );

    // Verify device did NOT receive the message
    expect(deviceWs.send).not.toHaveBeenCalled();
  });

  it('should broadcast to specific customer only in multi-tenant scenario', async () => {
    // Mock WebSocket connections for different customers
    const customer1Ws = {
      readyState: 1, // OPEN
      send: vi.fn((_, callback) => callback?.()), // Call callback immediately
      bufferedAmount: 0,
      on: vi.fn(),
    };

    const customer2Ws = {
      readyState: 1, // OPEN
      send: vi.fn((_, callback) => callback?.()), // Call callback immediately
      bufferedAmount: 0,
      on: vi.fn(),
    };

    // Add connections for different customers
    connectionManager.addConnection('conn-1', customer1Ws as any, {
      type: 'customer',
      customerId: 'customer-123',
      customerEmail: 'customer1@example.com',
    });

    connectionManager.addConnection('conn-2', customer2Ws as any, {
      type: 'customer',
      customerId: 'customer-456',
      customerEmail: 'customer2@example.com',
    });

    // Test data
    const messageData = {
      type: 'chat:message',
      sessionId: 'session-789',
      data: { content: 'Private message for customer 123' },
    };

    // Broadcast to specific customer only
    await connectionManager.broadcastToCustomer('customer-123', messageData);

    // Verify only customer-123 received the message
    expect(customer1Ws.send).toHaveBeenCalledWith(
      JSON.stringify(messageData),
      expect.any(Function)
    );

    // Verify customer-456 did NOT receive the message
    expect(customer2Ws.send).not.toHaveBeenCalled();
  });
});
