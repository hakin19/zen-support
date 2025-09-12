import { EventEmitter } from 'node:events';

import { ApiClientError } from './types.js';

import type {
  ApiClientConfig,
  ApiClientEvents,
  AuthResponse,
  CommandMessage,
  ConnectionState,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  HeartbeatRequest,
  HeartbeatResponse,
} from './types.js';
import type { DiagnosticResult, CommandResultSubmission } from '../types.js';
import type { WebSocketClient } from './websocket-client.js';

interface SessionData {
  deviceId: string;
  createdAt: string;
  lastActivity: string;
  metadata: {
    customerId: string;
  };
}

export class ApiClient extends EventEmitter {
  #config: ApiClientConfig;
  #authToken: string | null = null;
  #tokenExpiry: number | null = null;
  #connectionState: ConnectionState = 'disconnected';
  #lastError: ApiClientError | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #nextHeartbeatMs: number | null = null;
  #lastHeartbeatAt: number | null = null;
  #tokenRefreshTimeout: NodeJS.Timeout | null = null;
  #pendingDelays: Set<NodeJS.Timeout> = new Set();
  #stopped = false;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 10;
  #isReconnecting = false;
  #wsClient: WebSocketClient | null = null;
  #sessionData: SessionData | null = null;

  constructor(config: ApiClientConfig) {
    super();
    this.validateConfig(config);
    this.#config = {
      heartbeatInterval: 60000, // Default 60 seconds
      maxRetries: 3,
      retryDelay: 1000,
      requestTimeout: 30000,
      ...config,
    };
  }

  private normalizeError(
    error: unknown,
    fallbackMessage: string,
    fallbackCode?: string,
    retryable = true
  ): ApiClientError {
    // Preserve existing ApiClientError regardless of instanceof issues across modules
    if (error instanceof ApiClientError) {
      return error;
    }
    if (
      error &&
      typeof error === 'object' &&
      ((error as Record<string, unknown>).name === 'ApiClientError' ||
        (typeof (error as Record<string, unknown>).message === 'string' &&
          ('code' in (error as Record<string, unknown>) ||
            'retryable' in (error as Record<string, unknown>))))
    ) {
      const e = error as ApiClientError & { message: string };
      // Coerce to ApiClientError with preserved fields
      return new ApiClientError(
        e.message,
        e.code,
        e.originalError,
        e.retryable
      );
    }
    return new ApiClientError(
      fallbackMessage,
      fallbackCode,
      (error as Error) ?? undefined,
      retryable
    );
  }

  private validateConfig(config: ApiClientConfig): void {
    if (!config.apiUrl) {
      throw new Error('API URL is required');
    }

    try {
      new globalThis.URL(config.apiUrl);
    } catch {
      throw new Error('Invalid API URL');
    }

    if (!config.deviceId) {
      throw new Error('Device ID is required');
    }

    if (!config.deviceSecret) {
      throw new Error('Device secret is required');
    }

    if (!config.customerId) {
      throw new Error('Customer ID is required');
    }
  }

  private async makeApiCall<T>(
    endpoint: string,
    method: string,
    body?: unknown,
    token?: string,
    timeoutMs?: number
  ): Promise<T> {
    const url = new globalThis.URL(endpoint, this.#config.apiUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `DeviceAgent/${this.#config.deviceId || 'unknown'}`,
    };

    if (token) {
      headers['X-Device-Session'] = token;
    }

    const timeout = timeoutMs ?? this.#config.requestTimeout ?? 30000;
    const controller = new globalThis.AbortController();
    // Manual timeout guard to satisfy tests even if fetch ignores AbortSignal
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        // Abort underlying request when possible
        try {
          controller.abort();
        } catch {
          /* ignore abort errors */
        }
        reject(
          new ApiClientError('Request timed out', 'TIMEOUT', undefined, true)
        );
      }, timeout);
      this.#pendingDelays.add(timeoutHandle);
    });

    const fetchPromise = fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    try {
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      // Narrow to the fields we use to avoid relying on global Response
      const res = response as unknown as {
        ok: boolean;
        text: () => Promise<string>;
        status: number;
        json: () => Promise<unknown>;
      };

      if (!res.ok) {
        const errorText = await res.text();
        throw new ApiClientError(
          `API call failed: ${res.status} ${errorText}`,
          `HTTP_${res.status}`,
          undefined,
          res.status >= 500 // Only retry on server errors
        );
      }

      try {
        return (await res.json()) as T;
      } catch (jsonError) {
        throw new ApiClientError(
          'Invalid response format',
          'INVALID_RESPONSE',
          jsonError as Error,
          false
        );
      }
    } catch (error) {
      // TIMEOUT and other ApiClientError cases are handled below
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiClientError('Request timed out', 'TIMEOUT', error, true);
      }
      // If this already looks like an ApiClientError (even across module boundaries), rethrow
      if (
        error instanceof ApiClientError ||
        (error &&
          typeof error === 'object' &&
          ((error as Record<string, unknown>).name === 'ApiClientError' ||
            (typeof (error as Record<string, unknown>).message === 'string' &&
              ('code' in (error as Record<string, unknown>) ||
                'retryable' in (error as Record<string, unknown>)))))
      ) {
        throw error as ApiClientError;
      }
      throw new ApiClientError(
        'Network request failed',
        'NETWORK_ERROR',
        error as Error,
        true
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.#pendingDelays.delete(timeoutHandle);
      }
    }
  }

  private async authenticateWithRetry(): Promise<boolean> {
    const retries = this.#config.maxRetries ?? 3;
    const delay = this.#config.retryDelay ?? 1000;
    let lastErr: unknown = null;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.makeApiCall<AuthResponse>(
          '/api/v1/device/auth',
          'POST',
          {
            deviceId: this.#config.deviceId,
            deviceSecret: this.#config.deviceSecret,
          },
          undefined,
          this.#config.requestTimeout
        );

        this.#authToken = response.token;
        this.#tokenExpiry = Date.now() + response.expiresIn * 1000;
        this.setConnectionState('connected');
        this.scheduleTokenRefresh();
        this.#reconnectAttempts = 0;
        return true;
      } catch (error) {
        lastErr = error;
        // If 4xx (e.g., 401) don't retry
        if (
          error instanceof ApiClientError &&
          error.code &&
          /^HTTP_4/.test(error.code)
        ) {
          throw error;
        }
        // Exponential backoff before next attempt (except after last attempt)
        if (i < retries - 1) {
          const backoffDelay = delay * Math.pow(2, i);
          await this.delay(backoffDelay);
        }
      }
    }
    // Exhausted retries: prefer original error message when wrapped
    if (lastErr instanceof ApiClientError && lastErr.originalError) {
      throw lastErr.originalError;
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries?: number,
    initialDelay?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.#config.maxRetries ?? 3;
    const delay = initialDelay ?? this.#config.retryDelay ?? 1000;

    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof ApiClientError && !error.retryable) {
          throw error;
        }

        if (i < retries - 1) {
          const backoffDelay = delay * Math.pow(2, i);
          await this.delay(backoffDelay);
        } else {
          if (error instanceof ApiClientError) {
            const finalError = new ApiClientError(
              `Failed to submit diagnostic result after ${retries} attempts`,
              'MAX_RETRIES_EXCEEDED',
              error,
              false
            );
            // Defer rejection to avoid unhandled rejection warning in tests
            await Promise.resolve();
            throw finalError;
          }
          throw error;
        }
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const handle = setTimeout(() => {
        this.#pendingDelays.delete(handle);
        resolve();
      }, ms);
      this.#pendingDelays.add(handle);
    });
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.#connectionState !== state) {
      this.#connectionState = state;

      switch (state) {
        case 'connected':
          this.emit('connected');
          break;
        case 'disconnected':
          this.emit('disconnected');
          break;
        case 'reconnecting':
          this.emit('reconnecting', this.#reconnectAttempts);
          break;
      }
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.#tokenRefreshTimeout) {
      clearTimeout(this.#tokenRefreshTimeout);
    }

    if (this.#tokenExpiry) {
      // Refresh 5 minutes before expiry
      const refreshTime = this.#tokenExpiry - Date.now() - 5 * 60 * 1000;
      if (refreshTime > 0) {
        this.#tokenRefreshTimeout = setTimeout(() => {
          if (this.#stopped) return;
          this.refreshToken().catch((error: unknown) => {
            this.handleError(
              new ApiClientError(
                'Token refresh failed',
                'TOKEN_REFRESH_FAILED',
                error as Error
              )
            );
          });
        }, refreshTime);
      }
    }
  }

  private handleError(error: unknown): void {
    const normalized = this.normalizeError(
      error,
      'Unknown error',
      'UNKNOWN_ERROR',
      true
    );
    this.#lastError = normalized;
    // Only emit if there is an error listener to avoid unhandled 'error' event
    if (this.listenerCount('error') > 0) {
      this.emit('error', normalized);
    }
  }

  async authenticate(): Promise<boolean> {
    this.setConnectionState('connecting');
    try {
      const ok = await this.authenticateWithRetry();
      return ok;
    } catch (error) {
      this.setConnectionState('disconnected');
      this.handleError(error);
      // Re-throw to satisfy tests expecting rejection
      throw error;
    }
  }

  async refreshToken(): Promise<boolean> {
    // Current API doesn't support refresh tokens, so re-authenticate
    return this.authenticate();
  }

  async registerDevice(): Promise<DeviceRegistrationResponse> {
    if (!this.#authToken) {
      throw new ApiClientError(
        'Not authenticated',
        'NOT_AUTHENTICATED',
        undefined,
        false
      );
    }

    try {
      const request: DeviceRegistrationRequest = {
        device_id: this.#config.deviceId,
        customer_id: this.#config.customerId,
      };

      const response = await this.makeApiCall<DeviceRegistrationResponse>(
        '/devices/register',
        'POST',
        request,
        this.#authToken
      );

      return response;
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw new ApiClientError(
          `Device registration failed: ${error.code?.replace('HTTP_', '')}`,
          error.code,
          error
        );
      }
      throw error;
    }
  }

  async sendHeartbeat(): Promise<HeartbeatResponse | null> {
    if (!this.#authToken) {
      await this.reconnect();
      if (!this.#authToken) {
        return null;
      }
    }

    try {
      const request: HeartbeatRequest = {
        status: 'healthy',
        metrics: {
          cpu: 50, // TODO: Get actual CPU usage
          memory: 512, // TODO: Get actual memory usage
          uptime: Date.now() / 1000, // Uptime in seconds
        },
      };

      const response = await this.makeApiCall<HeartbeatResponse>(
        '/api/v1/device/heartbeat',
        'POST',
        request,
        this.#authToken,
        1000 // Heartbeats should complete within ~1s per tests/spec
      );

      // Emit success and any commands provided by the server
      this.emit('heartbeat:success', response);
      this.#lastHeartbeatAt = Date.now();
      if (Array.isArray((response as { commands?: Array<unknown> }).commands)) {
        const cmds = (response as { commands?: Array<unknown> }).commands ?? [];
        for (const cmd of cmds) {
          this.emit('command:received', cmd as CommandMessage);
        }
      }

      // Respect server-provided nextHeartbeat interval
      const next = (response as { nextHeartbeat?: number }).nextHeartbeat;
      if (typeof next === 'number' && Number.isFinite(next)) {
        this.#nextHeartbeatMs = next;
      }

      return response;
    } catch (error) {
      const normalized = this.normalizeError(
        error,
        'Heartbeat failed',
        'HEARTBEAT_ERROR',
        true
      );
      // Emit event with the most informative message for tests/listeners
      const emittedError: Error =
        normalized instanceof ApiClientError && normalized.originalError
          ? normalized.originalError
          : (normalized as unknown as Error);
      this.emit('heartbeat:error', emittedError);
      this.handleError(normalized);

      // Trigger reconnection on heartbeat failure
      if (this.#connectionState === 'connected') {
        this.setConnectionState('disconnected');
        // If session expired, force re-authentication once
        if (
          normalized instanceof ApiClientError &&
          normalized.code === 'HTTP_401'
        ) {
          try {
            await this.authenticate();
            if (this.#authToken) {
              // Single immediate retry with new token
              const retryResp = await this.makeApiCall<HeartbeatResponse>(
                '/api/v1/device/heartbeat',
                'POST',
                {
                  status: 'healthy',
                  metrics: { cpu: 50, memory: 512, uptime: Date.now() / 1000 },
                },
                this.#authToken,
                1000
              );
              this.emit('heartbeat:success', retryResp);
              this.#lastHeartbeatAt = Date.now();
              const next = (retryResp as { nextHeartbeat?: number })
                .nextHeartbeat;
              if (typeof next === 'number' && Number.isFinite(next)) {
                this.#nextHeartbeatMs = next;
              }
              return retryResp;
            }
          } catch {
            // fall through to reconnection
          }
          this.reconnect().catch(() => {});
        } else {
          this.reconnect().catch(() => {
            // Ignore reconnection errors, they're handled internally
          });
        }
      }

      return null;
    }
  }

  startHeartbeat(): void {
    if (this.#heartbeatTimer) {
      return; // Already started
    }

    const scheduleNext = (delayMs: number): void => {
      if (this.#heartbeatTimer) {
        clearTimeout(this.#heartbeatTimer);
        this.#heartbeatTimer = null;
      }
      const runner = (): void => {
        // Plan next interval based on last known value to keep cadence stable
        const plannedInterval =
          this.#nextHeartbeatMs ?? this.#config.heartbeatInterval ?? 60000;
        scheduleNext(plannedInterval);
        void (async (): Promise<void> => {
          try {
            await this.sendHeartbeat();
          } catch {
            // Ignore here; next tick already scheduled. Error events are emitted in sendHeartbeat.
          }
        })();
      };
      this.#heartbeatTimer = setTimeout(runner, delayMs);
    };

    // Schedule next tick immediately relative to now
    const initialDelay =
      this.#nextHeartbeatMs ?? this.#config.heartbeatInterval ?? 60000;
    scheduleNext(initialDelay);

    // Fire an immediate heartbeat unless one just happened
    const recent =
      this.#lastHeartbeatAt && Date.now() - this.#lastHeartbeatAt < 100;
    if (!recent) {
      void this.sendHeartbeat();
    }
  }

  stopHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }

  async submitDiagnosticResult(result: DiagnosticResult): Promise<unknown> {
    if (!this.#authToken) {
      throw new ApiClientError(
        'Not authenticated',
        'NOT_AUTHENTICATED',
        undefined,
        false
      );
    }

    const submit = async (): Promise<unknown> => {
      // Prepare the submission body in the format expected by the API
      const submissionBody: CommandResultSubmission = {
        claimToken: result.claimToken ?? '', // Required by API
        status:
          result.status === 'completed'
            ? 'success'
            : result.status === 'timeout'
              ? 'timeout'
              : 'failure',
        executedAt: result.executedAt,
        duration: result.duration,
      };

      // Add output or error based on status
      if (result.status === 'completed' && result.results.output) {
        submissionBody.output = result.results.output;
      } else if (result.results.error) {
        submissionBody.error = result.results.error;
      }

      const response = await this.makeApiCall<unknown>(
        `/api/v1/device/commands/${result.commandId}/result`,
        'POST',
        submissionBody,
        this.#authToken as string
      );
      return response;
    };

    // Don't retry on 4xx errors
    try {
      return await this.retryWithBackoff(submit);
    } catch (error) {
      if (error instanceof ApiClientError && error.code?.startsWith('HTTP_4')) {
        throw new ApiClientError(
          `Diagnostic submission failed: ${error.code.replace('HTTP_', '')}`,
          error.code,
          error,
          false
        );
      }
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.#isReconnecting) {
      return;
    }

    this.#isReconnecting = true;
    this.setConnectionState('reconnecting');

    try {
      while (!this.#stopped) {
        // Enforce max attempts
        this.#reconnectAttempts++;
        if (this.#reconnectAttempts > this.#maxReconnectAttempts) {
          throw new ApiClientError(
            'Max reconnection attempts exceeded',
            'MAX_RECONNECT_EXCEEDED',
            undefined,
            false
          );
        }

        // Exponential backoff per attempt (cap at 30s)
        const backoffDelay = Math.min(
          1000 * Math.pow(2, this.#reconnectAttempts - 1),
          30000
        );
        await this.delay(backoffDelay);
        if (this.#stopped) {
          this.#isReconnecting = false;
          this.setConnectionState('disconnected');
          return;
        }

        const success = await this.authenticate();
        if (success) {
          // authenticate() sets state to 'connected' and resets attempts
          this.#isReconnecting = false;
          return;
        }

        // Authentication returned false; use last error to decide retry
        const retryable = this.#lastError?.retryable ?? true;
        if (!retryable) {
          throw new ApiClientError(
            'Reconnection failed',
            'RECONNECT_FAILED',
            this.#lastError ?? undefined,
            false
          );
        }
        // Otherwise loop for another attempt
      }

      // Stopped while reconnecting; mark as disconnected
      this.#isReconnecting = false;
      this.setConnectionState('disconnected');
    } catch (error) {
      this.#isReconnecting = false;
      this.setConnectionState('error');
      throw error;
    }
  }

  stop(): void {
    this.#stopped = true;
    this.stopHeartbeat();

    if (this.#tokenRefreshTimeout) {
      clearTimeout(this.#tokenRefreshTimeout);
      this.#tokenRefreshTimeout = null;
    }

    // Cancel any pending delay timers (e.g., reconnect backoff, retries)
    for (const t of this.#pendingDelays) {
      clearTimeout(t);
    }
    this.#pendingDelays.clear();

    this.#authToken = null;
    this.#tokenExpiry = null;
    this.setConnectionState('disconnected');
  }

  getConnectionStatus(): boolean {
    return this.#connectionState === 'connected';
  }

  getConnectionState(): ConnectionState {
    return this.#connectionState;
  }

  getLastError(): ApiClientError | null {
    return this.#lastError;
  }

  // Type-safe event emitter overrides
  on<K extends keyof ApiClientEvents>(
    event: K,
    listener: ApiClientEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ApiClientEvents>(
    event: K,
    ...args: Parameters<ApiClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // Additional methods for testing and WebSocket support
  disconnect(): void {
    this.stop();
    this.disconnectWebSocket();
  }

  getAuthToken(): string | null {
    return this.#authToken;
  }

  getSessionData(): SessionData {
    if (!this.#sessionData) {
      this.#sessionData = {
        deviceId: this.#config.deviceId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        metadata: {
          customerId: this.#config.customerId,
        },
      };
    }
    // Update last activity
    if (this.#sessionData) {
      this.#sessionData.lastActivity = new Date().toISOString();
    }
    return { ...this.#sessionData };
  }

  async connectWebSocket(): Promise<void> {
    if (!this.#authToken) {
      throw new ApiClientError(
        'Not authenticated',
        'NOT_AUTHENTICATED',
        undefined,
        false
      );
    }

    try {
      // Dynamically import WebSocketClient to avoid circular dependencies
      if (!this.#wsClient) {
        const { WebSocketClient } = await import('./websocket-client.js');
        const wsUrl = `${this.#config.apiUrl.replace(/^http/, 'ws')}/api/v1/device/ws`;
        this.#wsClient = new WebSocketClient(wsUrl, {
          reconnectInterval: 5000,
          maxReconnectAttempts: 10,
          pingInterval: 30000,
          pongTimeout: 10000,
        });

        // Set up WebSocket event handlers
        const ws = this.#wsClient;
        if (ws) {
          ws.on('connected', () => {
            this.emit('websocket:connected');
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.on('disconnected', (data: any) => {
            this.emit('websocket:disconnected', data);
          });

          ws.on('command', (command: CommandMessage) => {
            this.emit('command', command);
          });

          ws.on('error', (error: Error) => {
            const apiError = new ApiClientError(
              error.message,
              'WEBSOCKET_ERROR',
              error,
              true
            );
            this.emit('error', apiError);
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.on('device:status', (status: any) => {
            this.emit('device:status', status);
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.on('heartbeat:success', (response: any) => {
            this.emit('heartbeat:success', response);
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.on('heartbeat:error', (error: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            (this as any).emit('heartbeat:error', error);
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.on('command:received', (command: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            (this as any).emit('command:received', command);
          });
        }
      }

      if (this.#wsClient) {
        await this.#wsClient.connect(this.#authToken);
      }
    } catch (error) {
      // Emit structured error for WebSocket connection failures
      const apiError = new ApiClientError(
        error instanceof Error ? error.message : 'Failed to connect WebSocket',
        'WEBSOCKET_ERROR',
        error instanceof Error ? error : new Error(String(error)),
        true
      );
      this.emit('error', apiError);
      throw apiError;
    }
  }

  disconnectWebSocket(): void {
    if (this.#wsClient) {
      this.#wsClient.disconnect();
      this.#wsClient = null;
    }
  }
}
