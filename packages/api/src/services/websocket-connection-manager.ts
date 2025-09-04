import { WebSocket } from 'ws';

export interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  metadata?: Record<string, any>;
  alive: boolean;
  connectedAt: Date;
  messageQueue?: Array<{
    message: string;
    resolve: (value: boolean) => void;
    size: number;
  }>;
  isProcessingQueue?: boolean;
  queuedBytes?: number;
}

export interface ConnectionStats {
  total: number;
  byType: Record<string, number>;
}

/**
 * Manages WebSocket connections with tracking, heartbeat, and graceful shutdown
 */
export class WebSocketConnectionManager {
  private connections: Map<string, WebSocketConnection>;
  private heartbeatInterval?: NodeJS.Timeout;
  // Backpressure thresholds - reduced to prevent memory exhaustion
  private readonly HIGH_WATER_MARK = 256 * 1024; // 256KB buffered amount threshold
  private readonly MAX_QUEUE_SIZE = 10; // Maximum queued messages per connection
  private readonly MAX_MESSAGE_SIZE = 100 * 1024; // 100KB max per message
  private readonly MAX_QUEUE_BYTES = 512 * 1024; // 512KB max queued bytes per connection

  constructor() {
    this.connections = new Map();
  }

  /**
   * Add a new connection to the manager
   */
  addConnection(
    connectionId: string,
    ws: WebSocket,
    metadata?: Record<string, any>
  ): void {
    this.connections.set(connectionId, {
      id: connectionId,
      ws,
      metadata: metadata ?? {},
      alive: true,
      connectedAt: new Date(),
    });

    // Setup pong handler for this connection
    ws.on('pong', () => {
      this.handlePong(connectionId);
    });
  }

  /**
   * Remove a connection from the manager
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Clear any pending messages
      if (connection.messageQueue) {
        connection.messageQueue.forEach(item => {
          item.resolve(false);
        });
        connection.messageQueue = [];
        connection.queuedBytes = 0;
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get a specific connection
   */
  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections
   */
  getAllConnections(): Map<string, WebSocketConnection> {
    return this.connections;
  }

  /**
   * Get connections by type (from metadata)
   */
  getConnectionsByType(type: string): WebSocketConnection[] {
    const result: WebSocketConnection[] = [];
    this.connections.forEach(conn => {
      if (conn.metadata?.type === type) {
        result.push(conn);
      }
    });
    return result;
  }

  /**
   * Get connections by metadata property
   */
  getConnectionsByMetadata(key: string, value: any): WebSocketConnection[] {
    const result: WebSocketConnection[] = [];
    this.connections.forEach(conn => {
      if (conn.metadata?.[key] === value) {
        result.push(conn);
      }
    });
    return result;
  }

  /**
   * Update connection metadata
   */
  updateConnectionMetadata(
    connectionId: string,
    metadata: Record<string, any>
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }
    connection.metadata = metadata;
    return true;
  }

  /**
   * Broadcast message to all connections with backpressure handling
   */
  async broadcastToAll(message: any): Promise<void> {
    const promises: Promise<boolean>[] = [];

    this.connections.forEach(conn => {
      promises.push(this.sendToConnection(conn.id, message));
    });

    await Promise.all(promises);
  }

  /**
   * Broadcast message to connections of a specific type with backpressure handling
   */
  async broadcastToType(type: string, message: any): Promise<void> {
    const connections = this.getConnectionsByType(type);
    const promises: Promise<boolean>[] = [];

    connections.forEach(conn => {
      promises.push(this.sendToConnection(conn.id, message));
    });

    await Promise.all(promises);
  }

  /**
   * Send message to a specific connection with backpressure handling
   */
  async sendToConnection(connectionId: string, message: any): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const messageString = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageString, 'utf8');

    // Reject messages that are too large
    if (messageSize > this.MAX_MESSAGE_SIZE) {
      console.warn(
        `Message too large (${messageSize} bytes) for connection ${connectionId}, dropping`
      );
      return false;
    }

    // Check buffered amount for backpressure
    if (connection.ws.bufferedAmount > this.HIGH_WATER_MARK) {
      // Initialize queue if needed
      if (!connection.messageQueue) {
        connection.messageQueue = [];
        connection.queuedBytes = 0;
      }

      // Check total queued bytes limit
      let currentQueuedBytes = connection.queuedBytes ?? 0;
      if (currentQueuedBytes + messageSize > this.MAX_QUEUE_BYTES) {
        // Drop oldest messages until we have space or queue is empty
        while (
          connection.messageQueue.length > 0 &&
          currentQueuedBytes + messageSize > this.MAX_QUEUE_BYTES
        ) {
          const dropped = connection.messageQueue.shift();
          if (dropped) {
            currentQueuedBytes -= dropped.size;
            connection.queuedBytes = currentQueuedBytes;
            dropped.resolve(false);
            console.warn(
              `Dropping oldest queued message for connection ${connectionId} (queue memory limit)`
            );
          }
        }
      }

      // Check queue size limit (message count)
      if (connection.messageQueue.length >= this.MAX_QUEUE_SIZE) {
        // Drop oldest message
        const dropped = connection.messageQueue.shift();
        if (dropped) {
          connection.queuedBytes = (connection.queuedBytes ?? 0) - dropped.size;
          dropped.resolve(false);
          console.warn(
            `Dropping oldest queued message for connection ${connectionId} (queue size limit)`
          );
        }
      }

      // Queue the message
      return new Promise<boolean>(resolve => {
        if (connection.messageQueue) {
          connection.messageQueue.push({
            message: messageString,
            resolve,
            size: messageSize,
          });
          connection.queuedBytes = (connection.queuedBytes ?? 0) + messageSize;
          void this.processMessageQueue(connectionId);
        } else {
          resolve(false);
        }
      });
    }

    // Send immediately if under threshold
    return new Promise<boolean>(resolve => {
      try {
        connection.ws.send(messageString, err => {
          if (err) {
            console.error(`Failed to send to ${connectionId}:`, err);
            resolve(false);
          } else {
            resolve(true);
            // Process any queued messages
            void this.processMessageQueue(connectionId);
          }
        });
      } catch (error) {
        console.error(`Error sending to ${connectionId}:`, error);
        resolve(false);
      }
    });
  }

  /**
   * Process queued messages for a connection
   */
  private async processMessageQueue(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (
      !connection?.messageQueue ||
      connection.messageQueue.length === 0 ||
      connection.isProcessingQueue
    ) {
      return;
    }

    // Prevent concurrent processing
    connection.isProcessingQueue = true;

    try {
      while (
        connection.messageQueue.length > 0 &&
        connection.ws.readyState === WebSocket.OPEN &&
        connection.ws.bufferedAmount < this.HIGH_WATER_MARK
      ) {
        const item = connection.messageQueue.shift();
        if (!item) break;

        await new Promise<void>(resolve => {
          connection.ws.send(item.message, err => {
            if (err) {
              console.error(
                `Failed to send queued message to ${connectionId}:`,
                err
              );
              item.resolve(false);
            } else {
              item.resolve(true);
            }
            // Update queued bytes
            connection.queuedBytes = (connection.queuedBytes ?? 0) - item.size;
            resolve();
          });
        });

        // Small delay to prevent tight loop
        if (connection.messageQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      connection.isProcessingQueue = false;
    }
  }

  /**
   * Start heartbeat mechanism for all connections
   */
  startHeartbeat(intervalMs = 30000): void {
    // Clear existing interval if any
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach(conn => {
        if (conn.ws.readyState === WebSocket.OPEN) {
          if (!conn.alive) {
            // Connection didn't respond to last ping, terminate it
            console.log(`Terminating dead connection: ${conn.id}`);
            conn.ws.terminate();
            this.removeConnection(conn.id);
          } else {
            // Mark as not alive and send ping
            conn.alive = false;
            conn.ws.ping();
          }
        }
      });
    }, intervalMs);
  }

  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Handle pong response from a connection
   */
  handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.alive = true;
    }
  }

  /**
   * Gracefully close all connections
   */
  async closeAllConnections(): Promise<void> {
    const promises: Promise<void>[] = [];

    this.connections.forEach(conn => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        promises.push(
          new Promise<void>(resolve => {
            try {
              conn.ws.close(1001, 'Server shutting down');
            } catch (error) {
              console.error(`Error closing connection ${conn.id}:`, error);
            }
            resolve();
          })
        );
      }
    });

    await Promise.all(promises);
    this.connections.clear();
    this.stopHeartbeat();
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): ConnectionStats {
    const stats: ConnectionStats = {
      total: this.connections.size,
      byType: {},
    };

    this.connections.forEach(conn => {
      const type = String(conn.metadata?.type ?? 'unknown');
      stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    });

    return stats;
  }

  /**
   * Clean up manager (for graceful shutdown)
   */
  async cleanup(): Promise<void> {
    await this.closeAllConnections();
  }
}
