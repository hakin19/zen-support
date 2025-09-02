import { EventEmitter } from 'node:events';

import { ApiClientError } from './types.js';

import type {
  ApiClientConfig,
  ApiClientEvents,
  AuthResponse,
  ConnectionState,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  DiagnosticResult,
} from './types.js';

export class ApiClient extends EventEmitter {
  #config: ApiClientConfig;
  #authToken: string | null = null;
  #refreshToken: string | null = null;
  #tokenExpiry: number | null = null;
  #connectionState: ConnectionState = 'disconnected';
  #lastError: ApiClientError | null = null;
  #heartbeatInterval: NodeJS.Timeout | null = null;
  #tokenRefreshTimeout: NodeJS.Timeout | null = null;
  #pendingDelays: Set<NodeJS.Timeout> = new Set();
  #stopped = false;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 10;
  #isReconnecting = false;

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
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const timeout = timeoutMs ?? this.#config.requestTimeout ?? 30000;
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    this.#pendingDelays.add(timeoutId);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiClientError(
          `API call failed: ${response.status} ${errorText}`,
          `HTTP_${response.status}`,
          undefined,
          response.status >= 500 // Only retry on server errors
        );
      }

      try {
        return (await response.json()) as T;
      } catch (jsonError) {
        throw new ApiClientError(
          'Invalid response format',
          'INVALID_RESPONSE',
          jsonError as Error,
          false
        );
      }
    } catch (error) {
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
      clearTimeout(timeoutId);
      this.#pendingDelays.delete(timeoutId);
    }
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
    this.emit('error', normalized);
  }

  async authenticate(): Promise<boolean> {
    try {
      this.setConnectionState('connecting');

      const response = await this.makeApiCall<AuthResponse>(
        '/auth/device',
        'POST',
        {
          device_id: this.#config.deviceId,
          device_secret: this.#config.deviceSecret,
        }
      );

      this.#authToken = response.access_token;
      this.#refreshToken = response.refresh_token ?? null;
      this.#tokenExpiry = Date.now() + response.expires_in * 1000;

      this.setConnectionState('connected');
      this.scheduleTokenRefresh();
      this.#reconnectAttempts = 0;

      return true;
    } catch (error) {
      this.setConnectionState('disconnected');

      // Do not emit in authenticate; just store normalized error
      this.#lastError = this.normalizeError(
        error,
        'Authentication failed',
        'AUTH_FAILED',
        true
      );

      return false;
    }
  }

  async refreshToken(): Promise<boolean> {
    if (!this.#refreshToken) {
      return this.authenticate();
    }

    try {
      const response = await this.makeApiCall<AuthResponse>(
        '/auth/refresh',
        'POST',
        {
          refresh_token: this.#refreshToken,
        }
      );

      this.#authToken = response.access_token;
      this.#refreshToken = response.refresh_token ?? this.#refreshToken;
      this.#tokenExpiry = Date.now() + response.expires_in * 1000;

      this.scheduleTokenRefresh();
      return true;
    } catch {
      // If refresh fails, try full authentication
      return this.authenticate();
    }
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
        device_id: this.#config.deviceId,
        timestamp: new Date().toISOString(),
        status: 'online',
      };

      const response = await this.makeApiCall<HeartbeatResponse>(
        '/devices/heartbeat',
        'POST',
        request,
        this.#authToken
      );

      // Emit any commands received
      if (response.commands && response.commands.length > 0) {
        response.commands.forEach(command => {
          this.emit('command', command);
        });
      }

      // Handle configuration updates
      if (response.configuration_update) {
        this.emit('configuration_update', response.configuration_update);
      }

      return response;
    } catch (error) {
      this.handleError(error);

      // Trigger reconnection on heartbeat failure
      if (this.#connectionState === 'connected') {
        this.setConnectionState('disconnected');
        this.reconnect().catch(() => {
          // Ignore reconnection errors, they're handled internally
        });
      }

      return null;
    }
  }

  startHeartbeat(): void {
    if (this.#heartbeatInterval) {
      return; // Already started
    }

    // Send initial heartbeat
    this.sendHeartbeat().catch(() => {
      // Errors are handled in sendHeartbeat
    });

    // Schedule regular heartbeats
    this.#heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(() => {
        // Errors are handled in sendHeartbeat
      });
    }, this.#config.heartbeatInterval ?? 60000);
  }

  stopHeartbeat(): void {
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      this.#heartbeatInterval = null;
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
      const response = await this.makeApiCall<unknown>(
        '/diagnostics/results',
        'POST',
        result,
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
      if (this.#stopped) {
        this.#isReconnecting = false;
        this.setConnectionState('disconnected');
        return;
      }
      this.#reconnectAttempts++;

      if (this.#reconnectAttempts > this.#maxReconnectAttempts) {
        throw new ApiClientError(
          'Max reconnection attempts exceeded',
          'MAX_RECONNECT_EXCEEDED',
          undefined,
          false
        );
      }

      // Exponential backoff for reconnection
      const backoffDelay = Math.min(
        1000 * Math.pow(2, this.#reconnectAttempts - 1),
        30000 // Max 30 seconds
      );

      await this.delay(backoffDelay);
      if (this.#stopped) {
        this.#isReconnecting = false;
        this.setConnectionState('disconnected');
        return;
      }
      const success = await this.authenticate();
      if (!success) {
        throw new ApiClientError('Reconnection failed', 'RECONNECT_FAILED');
      }

      this.#isReconnecting = false;
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
    this.#refreshToken = null;
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
}
