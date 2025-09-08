import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../websocket-client';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock implementation
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code, reason }));
      }
    }, 0);
  }

  // Helper methods for testing
  mockOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  mockMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', { data: JSON.stringify(data) })
      );
    }
  }

  mockError(error?: string): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  mockClose(code = 1000, reason = 'Normal closure'): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }
}

// Replace global WebSocket with mock
(global as any).WebSocket = MockWebSocket;

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock WebSocket constructor to capture instance
    const originalWebSocket = MockWebSocket;
    (global as any).WebSocket = vi.fn().mockImplementation((url: string) => {
      const ws = new originalWebSocket(url);
      mockWs = ws; // Keep reference to the latest one
      return ws;
    });
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect to WebSocket server', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        autoConnect: false,
      });

      const onConnect = vi.fn();
      client.on('connect', onConnect);

      client.connect();
      mockWs.mockOpen();

      expect(onConnect).toHaveBeenCalled();
      expect(client.isConnected()).toBe(true);
    });

    it('should auto-connect if enabled', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        autoConnect: true,
      });

      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:3000');
    });

    it('should disconnect from server', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const onDisconnect = vi.fn();
      client.on('disconnect', onDisconnect);

      client.disconnect();
      mockWs.mockClose();

      expect(onDisconnect).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle connection errors', () => {
      client = new WebSocketClient('ws://localhost:3000');

      const onError = vi.fn();
      client.on('error', onError);

      mockWs.mockError('Connection failed');

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Reconnection Logic', () => {
    it('should reconnect with exponential backoff', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        reconnect: true,
        reconnectDelay: 1000,
        reconnectDelayMax: 10000,
        reconnectDecay: 2,
      });

      mockWs.mockOpen();
      mockWs.mockClose(1006, 'Abnormal closure');

      // First reconnect attempt after 1000ms
      vi.advanceTimersByTime(1000);
      expect(WebSocket).toHaveBeenCalledTimes(2);

      // Simulate failure and next reconnect after 2000ms
      mockWs.mockClose(1006, 'Abnormal closure');
      vi.advanceTimersByTime(2000);
      expect(WebSocket).toHaveBeenCalledTimes(3);

      // Next reconnect after 4000ms
      mockWs.mockClose(1006, 'Abnormal closure');
      vi.advanceTimersByTime(4000);
      expect(WebSocket).toHaveBeenCalledTimes(4);
    });

    it('should respect max reconnect attempts', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        reconnect: true,
        reconnectAttempts: 3,
        reconnectDelay: 100,
      });

      const onReconnectFailed = vi.fn();
      client.on('reconnect_failed', onReconnectFailed);

      // Simulate 3 failed connection attempts
      for (let i = 0; i < 3; i++) {
        mockWs.mockClose(1006, 'Abnormal closure');
        vi.advanceTimersByTime(100);
      }

      // Should not attempt 4th reconnection
      mockWs.mockClose(1006, 'Abnormal closure');
      vi.advanceTimersByTime(100);

      expect(onReconnectFailed).toHaveBeenCalled();
      expect(WebSocket).toHaveBeenCalledTimes(4); // Initial + 3 reconnects
    });

    it('should reset reconnect attempts on successful connection', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        reconnect: true,
        reconnectAttempts: 3,
        reconnectDelay: 100,
      });

      // First connection
      mockWs.mockOpen();

      // Disconnect and reconnect twice
      for (let i = 0; i < 2; i++) {
        mockWs.mockClose(1006, 'Abnormal closure');
        vi.advanceTimersByTime(100);
      }

      // Successful reconnection
      mockWs.mockOpen();

      // Now should be able to reconnect 3 more times
      for (let i = 0; i < 3; i++) {
        mockWs.mockClose(1006, 'Abnormal closure');
        vi.advanceTimersByTime(100);
      }

      expect(WebSocket).toHaveBeenCalledTimes(6); // Initial + 2 + 3 reconnects
    });

    it('should not reconnect if disabled', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        reconnect: false,
      });

      mockWs.mockOpen();
      mockWs.mockClose(1006, 'Abnormal closure');

      vi.advanceTimersByTime(5000);

      expect(WebSocket).toHaveBeenCalledTimes(1); // Only initial connection
    });
  });

  describe('Heartbeat/Ping-Pong', () => {
    it('should send periodic heartbeats', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        heartbeatInterval: 5000,
      });

      const sendSpy = vi.spyOn(mockWs, 'send');
      mockWs.mockOpen();

      vi.advanceTimersByTime(5000);
      expect(sendSpy).toHaveBeenCalled();
      const firstCall = JSON.parse(sendSpy.mock.calls[0][0] as string);
      expect(firstCall.type).toBe('ping');
      expect(typeof firstCall.timestamp).toBe('number');

      vi.advanceTimersByTime(5000);
      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle pong responses', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        heartbeatInterval: 5000,
        pongTimeout: 3000,
      });

      mockWs.mockOpen();

      // Send ping
      vi.advanceTimersByTime(5000);

      // Receive pong
      mockWs.mockMessage({ type: 'pong', timestamp: Date.now() });

      // Should not disconnect - advance time less than pongTimeout
      vi.advanceTimersByTime(2000);
      expect(client.isConnected()).toBe(true);
    });

    it('should disconnect if pong not received', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        heartbeatInterval: 5000,
        pongTimeout: 3000,
      });

      const onDisconnect = vi.fn();
      client.on('disconnect', onDisconnect);

      mockWs.mockOpen();

      // Send ping
      vi.advanceTimersByTime(5000);

      // Don't send pong, wait for timeout
      vi.advanceTimersByTime(3000);

      expect(onDisconnect).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Pong timeout',
        })
      );
    });
  });

  describe('Message Handling', () => {
    it('should send messages when connected', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const sendSpy = vi.spyOn(mockWs, 'send');
      const message = { type: 'chat', content: 'Hello' };

      client.send(message);

      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should queue messages when disconnected', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        queueMessages: true,
      });

      const message1 = { type: 'chat', content: 'Message 1' };
      const message2 = { type: 'chat', content: 'Message 2' };

      client.send(message1);
      client.send(message2);

      const sendSpy = vi.spyOn(mockWs, 'send');
      mockWs.mockOpen();

      // Should send queued messages on connection
      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message1));
      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message2));
    });

    it('should respect max queue size', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        queueMessages: true,
        maxQueueSize: 2,
      });

      const onQueueFull = vi.fn();
      client.on('queue_full', onQueueFull);

      client.send({ type: 'msg', content: '1' });
      client.send({ type: 'msg', content: '2' });
      client.send({ type: 'msg', content: '3' }); // Should trigger queue full

      expect(onQueueFull).toHaveBeenCalled();
    });

    it('should receive and parse messages', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const onMessage = vi.fn();
      client.on('message', onMessage);

      const message = { type: 'chat', content: 'Hello from server' };
      mockWs.mockMessage(message);

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle malformed messages', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const onError = vi.fn();
      client.on('error', onError);

      // Send malformed JSON
      if (mockWs.onmessage) {
        mockWs.onmessage(
          new MessageEvent('message', { data: 'invalid json{' })
        );
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'parse_error',
        })
      );
    });
  });

  describe('Channel Subscription', () => {
    it('should subscribe to channels', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const sendSpy = vi.spyOn(mockWs, 'send');
      client.subscribe('chat:123');

      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'chat:123' })
      );
    });

    it('should unsubscribe from channels', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const sendSpy = vi.spyOn(mockWs, 'send');
      client.subscribe('chat:123');
      client.unsubscribe('chat:123');

      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe', channel: 'chat:123' })
      );
    });

    it('should emit channel-specific events', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const onChannelMessage = vi.fn();
      client.on('channel:chat:123', onChannelMessage);

      mockWs.mockMessage({
        type: 'channel',
        channel: 'chat:123',
        data: { content: 'Channel message' },
      });

      expect(onChannelMessage).toHaveBeenCalledWith({
        content: 'Channel message',
      });
    });

    it('should resubscribe to channels on reconnect', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        reconnect: true,
        reconnectDelay: 100,
      });

      mockWs.mockOpen();
      client.subscribe('chat:123');
      client.subscribe('device:456');

      // Disconnect
      mockWs.mockClose(1006, 'Abnormal closure');

      // Reconnect
      vi.advanceTimersByTime(100);
      const sendSpy = vi.spyOn(mockWs, 'send');
      mockWs.mockOpen();

      // Should resubscribe to both channels
      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'chat:123' })
      );
      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'device:456' })
      );
    });
  });

  describe('Authentication', () => {
    it('should send auth token on connection', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        auth: { token: 'test-token-123' },
      });

      const sendSpy = vi.spyOn(mockWs, 'send');
      mockWs.mockOpen();

      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth', token: 'test-token-123' })
      );
    });

    it('should handle auth failures', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        auth: { token: 'invalid-token' },
      });

      const onAuthError = vi.fn();
      client.on('auth_error', onAuthError);

      mockWs.mockOpen();
      mockWs.mockMessage({
        type: 'auth_error',
        error: 'Invalid token',
      });

      expect(onAuthError).toHaveBeenCalledWith({
        type: 'auth_error',
        error: 'Invalid token',
      });
    });

    it('should refresh auth token', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token-456');
      client = new WebSocketClient('ws://localhost:3000', {
        auth: {
          token: 'old-token-123',
          refreshToken,
        },
      });

      mockWs.mockOpen();
      mockWs.mockMessage({
        type: 'auth_error',
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });

      await vi.runAllTimersAsync();

      expect(refreshToken).toHaveBeenCalled();
      // Should reconnect with new token
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });
  });

  describe('Binary Data Support', () => {
    it('should handle binary messages', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        binaryType: 'arraybuffer',
      });

      mockWs.mockOpen();

      const onBinaryMessage = vi.fn();
      client.on('binary', onBinaryMessage);

      const binaryData = new ArrayBuffer(8);
      if (mockWs.onmessage) {
        mockWs.onmessage(new MessageEvent('message', { data: binaryData }));
      }

      expect(onBinaryMessage).toHaveBeenCalledWith(binaryData);
    });

    it('should send binary data', () => {
      client = new WebSocketClient('ws://localhost:3000');
      mockWs.mockOpen();

      const sendSpy = vi.spyOn(mockWs, 'send');
      const binaryData = new ArrayBuffer(8);

      client.sendBinary(binaryData);

      expect(sendSpy).toHaveBeenCalledWith(binaryData);
    });
  });

  describe('Connection State', () => {
    it('should track connection state', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        autoConnect: false,
      });

      expect(client.getState()).toBe('disconnected');

      client.connect();
      expect(client.getState()).toBe('connecting');

      mockWs.mockOpen();
      expect(client.getState()).toBe('connected');

      client.disconnect();
      expect(client.getState()).toBe('disconnecting');

      mockWs.mockClose();
      expect(client.getState()).toBe('disconnected');
    });

    it('should emit state change events', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        autoConnect: false,
      });

      const onStateChange = vi.fn();
      client.on('state_change', onStateChange);

      client.connect();
      mockWs.mockOpen();

      expect(onStateChange).toHaveBeenCalledWith({
        from: 'disconnected',
        to: 'connecting',
      });
      expect(onStateChange).toHaveBeenCalledWith({
        from: 'connecting',
        to: 'connected',
      });
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track message metrics', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        trackMetrics: true,
      });

      mockWs.mockOpen();

      client.send({ type: 'test' });
      client.send({ type: 'test' });
      mockWs.mockMessage({ type: 'response' });

      const metrics = client.getMetrics();
      expect(metrics.messagesSent).toBe(2);
      expect(metrics.messagesReceived).toBe(1);
      expect(metrics.connectionAttempts).toBe(1);
    });

    it('should track latency', () => {
      client = new WebSocketClient('ws://localhost:3000', {
        trackMetrics: true,
        heartbeatInterval: 1000,
      });

      mockWs.mockOpen();

      // Send ping
      vi.advanceTimersByTime(1000);

      // Receive pong after 50ms
      const now = Date.now();
      mockWs.mockMessage({ type: 'pong', timestamp: now - 50 });

      const metrics = client.getMetrics();
      expect(metrics.latency).toBeGreaterThanOrEqual(0);
    });
  });
});
