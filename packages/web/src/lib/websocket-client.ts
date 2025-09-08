import { EventEmitter } from 'events';

export interface WebSocketClientOptions {
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  reconnectDelayMax?: number;
  reconnectDecay?: number;
  heartbeatInterval?: number;
  pongTimeout?: number;
  queueMessages?: boolean;
  maxQueueSize?: number;
  binaryType?: 'blob' | 'arraybuffer';
  trackMetrics?: boolean;
  auth?: {
    token: string;
    refreshToken?: () => Promise<string>;
  };
}

export interface WebSocketMetrics {
  messagesSent: number;
  messagesReceived: number;
  connectionAttempts: number;
  reconnectAttempts: number;
  latency: number;
  bytesReceived: number;
  bytesSent: number;
  connectedAt?: Date;
  disconnectedAt?: Date;
}

type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting';

interface QueuedMessage {
  data: unknown;
  binary?: boolean;
  timestamp: number;
}

export class WebSocketClient extends EventEmitter {
  private url: string;
  private options: Required<WebSocketClientOptions>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private messageQueue: QueuedMessage[] = [];
  private subscribedChannels: Set<string> = new Set();
  private metrics: WebSocketMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    connectionAttempts: 0,
    reconnectAttempts: 0,
    latency: 0,
    bytesReceived: 0,
    bytesSent: 0,
  };
  private lastPingTimestamp = 0;

  constructor(url: string, options: WebSocketClientOptions = {}) {
    super();
    this.url = url;
    this.options = {
      autoConnect: options.autoConnect ?? true,
      reconnect: options.reconnect ?? true,
      reconnectAttempts: options.reconnectAttempts ?? Infinity,
      reconnectDelay: options.reconnectDelay ?? 1000,
      reconnectDelayMax: options.reconnectDelayMax ?? 30000,
      reconnectDecay: options.reconnectDecay ?? 1.5,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      pongTimeout: options.pongTimeout ?? 10000,
      queueMessages: options.queueMessages ?? true,
      maxQueueSize: options.maxQueueSize ?? 100,
      binaryType: options.binaryType ?? 'arraybuffer',
      trackMetrics: options.trackMetrics ?? false,
      auth: options.auth ?? { token: '' },
    };

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');
    this.metrics.connectionAttempts++;

    try {
      // For browser environments, append token as query parameter
      let connectUrl = this.url;
      if (this.options.auth.token && typeof window !== 'undefined') {
        const separator = this.url.includes('?') ? '&' : '?';
        connectUrl = `${this.url}${separator}token=${encodeURIComponent(this.options.auth.token)}`;
      }

      this.ws = new WebSocket(connectUrl);
      this.ws.binaryType = this.options.binaryType;

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      this.handleError(error as Event);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.options.reconnect = false;
    this.clearTimers();

    if (this.ws) {
      this.setState('disconnecting');
      this.ws.close(1000, 'Normal closure');
    }
  }

  /**
   * Send a message to the server
   */
  send(data: unknown): boolean {
    if (this.state !== 'connected') {
      if (this.options.queueMessages) {
        return this.queueMessage(data, false);
      }
      return false;
    }

    try {
      const message = JSON.stringify(data);
      this.ws?.send(message);

      if (this.options.trackMetrics) {
        this.metrics.messagesSent++;
        this.metrics.bytesSent += message.length;
      }

      return true;
    } catch (error) {
      this.emit('error', { type: 'send_error', error });
      return false;
    }
  }

  /**
   * Send binary data to the server
   */
  sendBinary(data: ArrayBuffer | Blob): boolean {
    if (this.state !== 'connected') {
      if (this.options.queueMessages) {
        return this.queueMessage(data, true);
      }
      return false;
    }

    try {
      this.ws?.send(data);

      if (this.options.trackMetrics) {
        this.metrics.messagesSent++;
        this.metrics.bytesSent +=
          data instanceof ArrayBuffer ? data.byteLength : data.size;
      }

      return true;
    } catch (error) {
      this.emit('error', { type: 'send_error', error });
      return false;
    }
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string): void {
    this.subscribedChannels.add(channel);
    if (this.state === 'connected') {
      this.send({ type: 'subscribe', channel });
    }
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    if (this.state === 'connected') {
      this.send({ type: 'unsubscribe', channel });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get connection metrics
   */
  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      connectionAttempts: 0,
      reconnectAttempts: 0,
      latency: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };
  }

  private handleOpen(): void {
    this.setState('connected');
    this.reconnectAttempts = 0;
    this.metrics.connectedAt = new Date();

    // Send auth message only if not in browser (browser uses query param)
    // or if token wasn't sent via query parameter
    if (this.options.auth.token && typeof window === 'undefined') {
      this.send({ type: 'auth', token: this.options.auth.token });
    }

    // Resubscribe to channels
    this.subscribedChannels.forEach(channel => {
      this.send({ type: 'subscribe', channel });
    });

    // Flush message queue
    this.flushQueue();

    // Start heartbeat
    this.startHeartbeat();

    this.emit('connect');
  }

  private handleClose(event: CloseEvent): void {
    this.setState('disconnected');
    this.metrics.disconnectedAt = new Date();
    this.clearTimers();

    this.emit('disconnect', {
      code: event.code,
      reason: event.reason || 'Connection closed',
    });

    // Handle reconnection
    if (this.options.reconnect && !event.wasClean) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Event): void {
    this.emit('error', { type: 'connection_error', error });
  }

  private handleMessage(event: MessageEvent): void {
    if (this.options.trackMetrics) {
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived +=
        typeof event.data === 'string'
          ? event.data.length
          : (event.data as ArrayBuffer).byteLength;
    }

    // Handle binary data
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      this.emit('binary', event.data);
      return;
    }

    // Parse JSON messages
    try {
      const message = JSON.parse(event.data as string);

      // Handle system messages
      switch ((message as { type?: string }).type) {
        case 'pong':
          this.handlePong(message);
          break;

        case 'auth_error':
          void this.handleAuthError(message);
          break;

        case 'auth_success':
          this.emit('authenticated');
          break;

        case 'subscribed':
          this.emit('subscribed', (message as { channel?: string }).channel);
          break;

        case 'unsubscribed':
          this.emit('unsubscribed', (message as { channel?: string }).channel);
          break;

        case 'channel':
          this.emit(
            `channel:${(message as { channel?: string }).channel}`,
            (message as { data?: unknown }).data
          );
          break;

        default:
          this.emit('message', message);
      }
    } catch (error) {
      this.emit('error', { type: 'parse_error', error, data: event.data });
    }
  }

  private handlePong(message: unknown): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    // Calculate latency
    if (
      (message as { timestamp?: number }).timestamp &&
      this.lastPingTimestamp
    ) {
      this.metrics.latency = Date.now() - this.lastPingTimestamp;
    }
  }

  private async handleAuthError(message: unknown): Promise<void> {
    this.emit('auth_error', message);

    // Try to refresh token
    if (
      (message as { code?: string }).code === 'TOKEN_EXPIRED' &&
      this.options.auth.refreshToken
    ) {
      try {
        const newToken = await this.options.auth.refreshToken();
        this.options.auth.token = newToken;

        // Reconnect with new token
        this.ws?.close(1000, 'Token refresh');
      } catch (error) {
        this.emit('error', { type: 'token_refresh_error', error });
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected') {
        this.lastPingTimestamp = Date.now();
        this.send({ type: 'ping', timestamp: this.lastPingTimestamp });

        // Set pong timeout
        this.pongTimer = setTimeout(() => {
          this.emit('disconnect', { reason: 'Pong timeout' });
          this.ws?.close(4000, 'Pong timeout');
        }, this.options.pongTimeout);
      }
    }, this.options.heartbeatInterval);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.reconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    const delay = Math.min(
      this.options.reconnectDelay *
        Math.pow(this.options.reconnectDecay, this.reconnectAttempts),
      this.options.reconnectDelayMax
    );

    this.setState('reconnecting');
    this.reconnectAttempts++;
    this.metrics.reconnectAttempts++;

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private queueMessage(data: unknown, binary: boolean): boolean {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      this.emit('queue_full');
      return false;
    }

    this.messageQueue.push({
      data,
      binary,
      timestamp: Date.now(),
    });

    return true;
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        if (message.binary) {
          this.sendBinary(message.data as ArrayBuffer | Blob);
        } else {
          this.send(message.data);
        }
      }
    }
  }

  private setState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState) {
      this.emit('state_change', { from: oldState, to: newState });
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
}
