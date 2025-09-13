import { EventEmitter } from 'events';

import WebSocket from 'ws';

import type {
  WebSocketClientOptions,
  WebSocketMessage,
  WebSocketMetrics,
  ConnectionState,
} from './types.js';

/**
 * WebSocket client for device agent communication with API
 * Implements reconnection logic, message queuing, and heartbeat/pong handling
 */
export class WebSocketClient extends EventEmitter {
  private url: string;
  private options: Required<WebSocketClientOptions>;
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private metrics: WebSocketMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    connectionUptime: 0,
    reconnectCount: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
  };
  private sessionToken: string | null = null;
  private isReconnecting = false;
  private shouldReconnect = true;

  constructor(url: string, options: WebSocketClientOptions = {}) {
    super();
    this.url = url;
    this.options = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      maxReconnectInterval: 30000,
      pingInterval: 30000,
      pongTimeout: 10000,
      queueMessages: true,
      maxQueueSize: 100,
      ...options,
    };
  }

  /**
   * Connect to WebSocket server with authentication
   */
  async connect(sessionToken: string): Promise<void> {
    if (this.connectionState === 'connected') {
      console.log('WebSocket already connected');
      return;
    }

    if (this.connectionState === 'connecting') {
      console.log('WebSocket connection already in progress');
      return;
    }

    this.sessionToken = sessionToken;
    this.shouldReconnect = true;
    await this.establishConnection();
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.connectionState = 'connecting';
        this.emit('connecting');

        // Create WebSocket with authentication header
        this.ws = new WebSocket(this.url, {
          headers: {
            'X-Device-Session': this.sessionToken ?? '',
          },
        });

        // Set up event handlers
        this.setupEventHandlers();

        // Set connection timeout
        const timeout = setTimeout(() => {
          if (this.connectionState === 'connecting') {
            this.ws?.close();
            const error = new Error('Connection timeout');
            this.handleError(error);
            reject(error);
          }
        }, 10000);

        // Handle successful connection
        this.ws.once('open', () => {
          clearTimeout(timeout);
          this.handleOpen();
          resolve();
        });

        // Handle connection error
        this.ws.once('error', (error: Error) => {
          clearTimeout(timeout);
          this.handleError(error);
          reject(error);
        });
      } catch (error) {
        this.handleError(error as Error);
        reject(error as Error);
      }
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data: WebSocket.Data) => this.handleMessage(data));
    this.ws.on('error', (error: Error) => this.handleError(error));
    this.ws.on('close', (code: number, reason: Buffer) =>
      this.handleClose(code, reason.toString())
    );
    this.ws.on('ping', () => this.handlePing());
    this.ws.on('pong', () => this.handlePong());
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log('WebSocket connected');
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.metrics.lastConnectedAt = new Date();

    // Send connected message
    this.send({
      type: 'connected',
      payload: {
        timestamp: new Date().toISOString(),
      },
    });

    // Start ping timer
    this.startPingTimer();

    // Process queued messages
    this.processMessageQueue();

    this.emit('connected');
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      let dataStr: string;
      if (typeof data === 'string') {
        dataStr = data;
      } else if (Buffer.isBuffer(data)) {
        dataStr = data.toString('utf-8');
      } else if (data instanceof ArrayBuffer) {
        dataStr = Buffer.from(data).toString('utf-8');
      } else if (Array.isArray(data)) {
        dataStr = Buffer.concat(
          data.map(d => (Buffer.isBuffer(d) ? d : Buffer.from(d)))
        ).toString('utf-8');
      } else {
        dataStr = (data as unknown as { toString: () => string }).toString();
      }
      const message = JSON.parse(dataStr) as WebSocketMessage;
      this.metrics.messagesReceived++;

      switch (message.type) {
        case 'heartbeat':
          this.emit('heartbeat', message.payload);
          break;

        case 'command':
          this.emit('command', message.payload);
          break;

        case 'command_result':
          this.emit('command:result', message.payload);
          break;

        case 'error':
          this.emit(
            'error',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            new Error(message.payload?.message ?? 'Unknown error')
          );
          break;

        default:
          this.emit('message', message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(code: number, reason: string): void {
    console.log(`WebSocket closed: ${code} - ${reason}`);

    this.connectionState = 'disconnected';
    this.metrics.lastDisconnectedAt = new Date();
    this.stopPingTimer();
    this.stopPongTimer();

    // Emit device_status offline event
    this.emit('device:status', { status: 'offline' });
    this.emit('disconnected', { code, reason });

    // Attempt reconnection if appropriate
    if (this.shouldReconnect && !this.isReconnecting) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle ping from server
   */
  private handlePing(): void {
    // WebSocket library automatically sends pong
    this.emit('ping');
  }

  /**
   * Handle pong from server
   */
  private handlePong(): void {
    this.stopPongTimer();
    this.emit('pong');
  }

  /**
   * Start ping timer
   */
  private startPingTimer(): void {
    this.stopPingTimer();

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();

        // Start pong timeout timer
        this.startPongTimer();
      }
    }, this.options.pingInterval);
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Start pong timeout timer
   */
  private startPongTimer(): void {
    this.stopPongTimer();

    this.pongTimer = setTimeout(() => {
      console.error('Pong timeout - closing connection');
      this.ws?.close(1000, 'Pong timeout');
    }, this.options.pongTimeout);
  }

  /**
   * Stop pong timeout timer
   */
  private stopPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect:failed');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.metrics.reconnectCount++;

    // Calculate exponential backoff with jitter
    const baseDelay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      this.options.maxReconnectInterval
    );
    const jitter = Math.random() * 0.3 * baseDelay;
    const delay = baseDelay + jitter;

    console.log(
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.reconnectTimer = setTimeout(async () => {
      this.emit('reconnecting', { attempt: this.reconnectAttempts });

      try {
        await this.establishConnection();
        // Success - establishConnection will reset isReconnecting
      } catch (error) {
        // Connection failed, reset flag and schedule next retry
        console.error('Reconnection failed:', error);
        this.isReconnecting = false;

        // Schedule next reconnection attempt if we haven't exceeded max attempts
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          // Max attempts reached, emit failure event
          this.emit('reconnect:failed');
        }
      }
    }, delay);
  }

  /**
   * Send message through WebSocket
   */
  send(message: WebSocketMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      if (this.options.queueMessages) {
        return this.queueMessage(message);
      }
      console.warn('WebSocket not connected, message dropped');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      this.metrics.messagesSent++;
      this.emit('message:sent', message);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Queue message for later sending
   */
  private queueMessage(message: WebSocketMessage): boolean {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      console.warn('Message queue full, dropping oldest message');
      this.messageQueue.shift();
    }

    this.messageQueue.push(message);
    return true;
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (
      this.messageQueue.length > 0 &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Send heartbeat message
   */
  sendHeartbeat(metrics: unknown): void {
    this.send({
      type: 'heartbeat',
      payload: {
        timestamp: new Date().toISOString(),
        metrics,
      },
    });
  }

  /**
   * Send command result
   */
  sendCommandResult(commandId: string, result: unknown): void {
    this.send({
      type: 'command_result',
      payload: {
        commandId,
        result,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingTimer();
    this.stopPongTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connectionState = 'disconnected';
    this.messageQueue = [];
    this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection metrics
   */
  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return (
      this.connectionState === 'connected' &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  /**
   * Update session token for reconnection
   */
  updateSessionToken(token: string): void {
    this.sessionToken = token;
  }
}
