import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketConnectionManager } from './websocket-connection-manager';
import { WebSocket } from 'ws';

describe('WebSocketConnectionManager', () => {
  let manager: WebSocketConnectionManager;
  let mockWs: any;

  beforeEach(() => {
    manager = new WebSocketConnectionManager();
    mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
      ping: vi.fn(),
      pong: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should add a new connection', () => {
      const connectionId = 'conn-123';
      const metadata = { deviceId: 'device-123', type: 'device' };

      manager.addConnection(connectionId, mockWs, metadata);

      const connection = manager.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.ws).toBe(mockWs);
      expect(connection?.metadata).toEqual(metadata);
    });

    it('should remove a connection', () => {
      const connectionId = 'conn-123';
      manager.addConnection(connectionId, mockWs);

      manager.removeConnection(connectionId);

      const connection = manager.getConnection(connectionId);
      expect(connection).toBeUndefined();
    });

    it('should get all connections', () => {
      manager.addConnection('conn-1', mockWs);
      manager.addConnection('conn-2', { ...mockWs });
      manager.addConnection('conn-3', { ...mockWs });

      const allConnections = manager.getAllConnections();
      expect(allConnections.size).toBe(3);
      expect(allConnections.has('conn-1')).toBe(true);
      expect(allConnections.has('conn-2')).toBe(true);
      expect(allConnections.has('conn-3')).toBe(true);
    });

    it('should get connections by type', () => {
      manager.addConnection('conn-1', mockWs, { type: 'device' });
      manager.addConnection('conn-2', { ...mockWs }, { type: 'customer' });
      manager.addConnection('conn-3', { ...mockWs }, { type: 'device' });

      const deviceConnections = manager.getConnectionsByType('device');
      expect(deviceConnections.length).toBe(2);
      expect(deviceConnections[0].id).toBe('conn-1');
      expect(deviceConnections[1].id).toBe('conn-3');
    });

    it('should get connections by metadata property', () => {
      manager.addConnection('conn-1', mockWs, { deviceId: 'device-123' });
      manager.addConnection(
        'conn-2',
        { ...mockWs },
        { deviceId: 'device-456' }
      );
      manager.addConnection(
        'conn-3',
        { ...mockWs },
        { customerId: 'customer-789' }
      );

      const deviceConnections = manager.getConnectionsByMetadata(
        'deviceId',
        'device-123'
      );
      expect(deviceConnections.length).toBe(1);
      expect(deviceConnections[0].id).toBe('conn-1');
    });

    it('should update connection metadata', () => {
      const connectionId = 'conn-123';
      manager.addConnection(connectionId, mockWs, { status: 'connected' });

      manager.updateConnectionMetadata(connectionId, {
        status: 'authenticated',
      });

      const connection = manager.getConnection(connectionId);
      expect(connection?.metadata).toEqual({ status: 'authenticated' });
    });

    it('should handle connection not found when updating', () => {
      const result = manager.updateConnectionMetadata('non-existent', {
        status: 'test',
      });
      expect(result).toBe(false);
    });
  });

  describe('Broadcast Operations', () => {
    it('should broadcast to all connections', async () => {
      const ws1 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };
      const ws2 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };
      const ws3 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };

      manager.addConnection('conn-1', ws1);
      manager.addConnection('conn-2', ws2);
      manager.addConnection('conn-3', ws3);

      const message = { type: 'broadcast', data: 'test' };
      await manager.broadcastToAll(message);

      expect(ws1.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
      expect(ws2.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
      expect(ws3.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
    });

    it('should broadcast to connections by type', async () => {
      const ws1 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };
      const ws2 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };
      const ws3 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };

      manager.addConnection('conn-1', ws1, { type: 'device' });
      manager.addConnection('conn-2', ws2, { type: 'customer' });
      manager.addConnection('conn-3', ws3, { type: 'device' });

      const message = { type: 'device_update', data: 'test' };
      await manager.broadcastToType('device', message);

      expect(ws1.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
      expect(ws2.send).not.toHaveBeenCalled();
      expect(ws3.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
    });

    it('should send to specific connection', async () => {
      const ws1 = { ...mockWs, send: vi.fn((msg, cb) => cb && cb()) };
      manager.addConnection('conn-1', ws1);

      const message = { type: 'direct', data: 'test' };
      const result = await manager.sendToConnection('conn-1', message);

      expect(result).toBe(true);
      expect(ws1.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function)
      );
    });

    it('should handle send failure for closed connection', async () => {
      const ws1 = { ...mockWs, readyState: WebSocket.CLOSED, send: vi.fn() };
      manager.addConnection('conn-1', ws1);

      const message = { type: 'test', data: 'test' };
      const result = await manager.sendToConnection('conn-1', message);

      expect(result).toBe(false);
      expect(ws1.send).not.toHaveBeenCalled();
    });

    it('should handle send errors gracefully', async () => {
      const ws1 = {
        ...mockWs,
        send: vi.fn().mockImplementation((msg, cb) => {
          cb && cb(new Error('Send failed'));
        }),
      };
      manager.addConnection('conn-1', ws1);

      const message = { type: 'test', data: 'test' };
      const result = await manager.sendToConnection('conn-1', message);

      expect(result).toBe(false);
    });
  });

  describe('Heartbeat Management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start heartbeat for all connections', () => {
      const ws1 = { ...mockWs, ping: vi.fn() };
      const ws2 = { ...mockWs, ping: vi.fn() };

      manager.addConnection('conn-1', ws1);
      manager.addConnection('conn-2', ws2);

      manager.startHeartbeat(30000); // 30 second interval

      // Fast-forward time
      vi.advanceTimersByTime(30000);

      expect(ws1.ping).toHaveBeenCalled();
      expect(ws2.ping).toHaveBeenCalled();
    });

    it('should stop heartbeat', () => {
      const ws1 = { ...mockWs, ping: vi.fn() };
      manager.addConnection('conn-1', ws1);

      manager.startHeartbeat(30000);
      manager.stopHeartbeat();

      // Fast-forward time
      vi.advanceTimersByTime(60000);

      // Should only be called once before stopping
      expect(ws1.ping).not.toHaveBeenCalled();
    });

    it('should mark connections as alive on pong', () => {
      const connectionId = 'conn-123';
      manager.addConnection(connectionId, mockWs);

      manager.handlePong(connectionId);

      const connection = manager.getConnection(connectionId);
      expect(connection?.alive).toBe(true);
    });

    it('should terminate dead connections', () => {
      const ws1 = { ...mockWs, terminate: vi.fn() };
      const ws2 = { ...mockWs, terminate: vi.fn() };

      manager.addConnection('conn-1', ws1);
      manager.addConnection('conn-2', ws2);

      // Mark conn-1 as dead (no pong received)
      const conn1 = manager.getConnection('conn-1');
      if (conn1) conn1.alive = false;

      // Start heartbeat
      manager.startHeartbeat(30000);

      // Fast-forward to trigger heartbeat check
      vi.advanceTimersByTime(30000);

      // conn-1 should be terminated, conn-2 should receive ping
      expect(ws1.terminate).toHaveBeenCalled();
      expect(ws2.ping).toHaveBeenCalled();
      expect(manager.getConnection('conn-1')).toBeUndefined();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all connections with proper code and message', async () => {
      const ws1 = { ...mockWs, close: vi.fn() };
      const ws2 = { ...mockWs, close: vi.fn() };
      const ws3 = { ...mockWs, close: vi.fn() };

      manager.addConnection('conn-1', ws1);
      manager.addConnection('conn-2', ws2);
      manager.addConnection('conn-3', ws3);

      await manager.closeAllConnections();

      expect(ws1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(ws2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(ws3.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(manager.getAllConnections().size).toBe(0);
    });

    it('should handle close errors gracefully', async () => {
      const ws1 = {
        ...mockWs,
        close: vi.fn().mockImplementation(() => {
          throw new Error('Close failed');
        }),
      };
      manager.addConnection('conn-1', ws1);

      // Should not throw
      await expect(manager.closeAllConnections()).resolves.toBeUndefined();
      expect(manager.getAllConnections().size).toBe(0);
    });

    it('should skip closing already closed connections', async () => {
      const ws1 = { ...mockWs, readyState: WebSocket.CLOSED, close: vi.fn() };
      manager.addConnection('conn-1', ws1);

      await manager.closeAllConnections();

      expect(ws1.close).not.toHaveBeenCalled();
      expect(manager.getAllConnections().size).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should get connection count', () => {
      manager.addConnection('conn-1', mockWs);
      manager.addConnection('conn-2', mockWs);
      manager.addConnection('conn-3', mockWs);

      expect(manager.getConnectionCount()).toBe(3);
    });

    it('should get connection statistics', () => {
      manager.addConnection('conn-1', mockWs, { type: 'device' });
      manager.addConnection('conn-2', mockWs, { type: 'customer' });
      manager.addConnection('conn-3', mockWs, { type: 'device' });
      manager.addConnection('conn-4', mockWs, { type: 'customer' });
      manager.addConnection('conn-5', mockWs, { type: 'admin' });

      const stats = manager.getConnectionStats();

      expect(stats).toEqual({
        total: 5,
        byType: {
          device: 2,
          customer: 2,
          admin: 1,
        },
      });
    });

    it('should track connection duration', async () => {
      vi.useRealTimers();
      const connectionId = 'conn-123';
      manager.addConnection(connectionId, mockWs);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const connection = manager.getConnection(connectionId);
      expect(connection?.connectedAt).toBeDefined();
      expect(Date.now() - connection!.connectedAt.getTime()).toBeGreaterThan(
        90
      );
    });
  });
});
