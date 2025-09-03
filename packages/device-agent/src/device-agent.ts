import { EventEmitter } from 'events';

import { getDeviceId } from './utils/device-id-generator.js';

import type {
  DeviceConfig,
  DeviceStatus,
  RegistrationResponse,
  HeartbeatResponse,
  DiagnosticCommand,
  DiagnosticResult,
  HealthStatus,
} from './types.js';

/**
 * DeviceAgent class that manages the lifecycle of a device agent
 * including registration, heartbeat, and command processing
 */
export class DeviceAgent extends EventEmitter {
  #config: DeviceConfig;
  #status: DeviceStatus = 'initialized';
  #authToken: string | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #heartbeatInterval: number;
  #isRegistered = false;
  #startTime: Date | null = null;
  #lastHeartbeat: Date | null = null;
  #heartbeatCount = 0;
  #heartbeatErrors = 0;
  #lastError: Error | null = null;

  constructor(config: DeviceConfig) {
    super();
    // Auto-generate device ID only if not provided but not empty string
    const configWithDeviceId = {
      ...config,
      deviceId: config.deviceId ?? getDeviceId(),
    };
    this.validateConfig(configWithDeviceId);
    this.#config = configWithDeviceId;
    this.#heartbeatInterval = config.heartbeatInterval ?? 60000;
  }

  private validateConfig(config: DeviceConfig): void {
    if (!config.deviceId || config.deviceId.trim() === '') {
      throw new Error('Device ID is required');
    }
    if (!config.deviceSecret || config.deviceSecret.trim() === '') {
      throw new Error('Device secret is required');
    }
    if (!config.apiUrl || !this.isValidUrl(config.apiUrl)) {
      throw new Error('Invalid API URL');
    }
    if (!config.customerId || config.customerId.trim() === '') {
      throw new Error('Customer ID is required');
    }
    if (
      config.heartbeatInterval !== undefined &&
      config.heartbeatInterval <= 0
    ) {
      throw new Error('Heartbeat interval must be positive');
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new globalThis.URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.#status === 'running') {
      throw new Error('Agent is already running');
    }

    try {
      this.#status = 'running';
      this.#startTime = new Date();

      // Register with the API
      await this.register();

      // Start heartbeat
      this.startHeartbeat();

      this.emit('started');
    } catch (error) {
      this.#status = 'error';
      this.#lastError = error as Error;
      this.emit('error', error);
      throw error;
    }
  }

  stop(): void {
    if (this.#status !== 'running') {
      throw new Error('Agent is not running');
    }

    this.stopHeartbeat();
    this.#status = 'stopped';
    this.#isRegistered = false;
    this.#authToken = null;

    this.emit('stopped');
  }

  shutdown(): void {
    if (this.#status === 'running') {
      this.stop();
    }
  }

  async recover(): Promise<void> {
    if (this.#status !== 'error') {
      throw new Error('Agent is not in error state');
    }

    this.#status = 'recovering';

    try {
      await this.register();
      this.startHeartbeat();
      this.#status = 'running';
      this.#lastError = null; // Clear error on successful recovery
      this.emit('recovered');
    } catch (error) {
      this.#status = 'error';
      this.#lastError = error as Error;
      throw error;
    }
  }

  private async register(): Promise<void> {
    // In mock mode, simulate successful registration
    if (this.#config.mockMode) {
      console.log('🎭 Mock mode: Simulating registration');
      this.#authToken = `mock-token-${Date.now()}`;
      this.#isRegistered = true;
      this.emit('registered');
      return;
    }

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await this.makeApiCall<RegistrationResponse>(
          '/api/v1/devices/register',
          'POST',
          {
            deviceId: this.#config.deviceId,
            deviceSecret: this.#config.deviceSecret,
            customerId: this.#config.customerId,
            metadata: {
              agentVersion: '1.0.0',
              platform: process.platform,
              nodeVersion: process.version,
            },
          }
        );

        this.#authToken = response.token;
        this.#isRegistered = true;

        // Update heartbeat interval if server provides one
        if (response.heartbeatInterval) {
          this.#heartbeatInterval = response.heartbeatInterval;
        }

        this.emit('registered');
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          // Wait before retry with exponential backoff
          await this.delay(Math.pow(2, i) * 1000);
        }
      }
    }

    throw lastError ?? new Error('Registration failed');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing timer

    const sendHeartbeatCycle = async (): Promise<void> => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        this.#heartbeatErrors++;
        this.emit('heartbeat:error', error);

        // Retry after a short delay
        setTimeout(() => {
          if (this.#status === 'running') {
            void sendHeartbeatCycle();
          }
        }, 5000);
        return;
      }

      // Schedule next heartbeat
      if (this.#status === 'running') {
        this.#heartbeatTimer = setTimeout(
          () => void sendHeartbeatCycle(),
          this.#heartbeatInterval
        );
      }
    };

    // Send first heartbeat immediately, then schedule regular intervals
    void sendHeartbeatCycle();
  }

  private stopHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<HeartbeatResponse> {
    if (!this.#authToken) {
      throw new Error('Not authenticated');
    }

    // In mock mode, simulate successful heartbeat
    if (this.#config.mockMode) {
      const mockResponse: HeartbeatResponse = {
        acknowledged: true,
        commands: [],
        nextHeartbeat: this.#heartbeatInterval,
      };

      this.#lastHeartbeat = new Date();
      this.#heartbeatCount++;
      this.emit('heartbeat', mockResponse);
      return mockResponse;
    }

    const response = await this.makeApiCall<HeartbeatResponse>(
      `/api/v1/devices/${this.#config.deviceId}/heartbeat`,
      'POST',
      {
        status: 'online',
        metrics: {
          uptime: this.getUptime(),
          heartbeatCount: this.#heartbeatCount,
          memoryUsage: process.memoryUsage(),
        },
      },
      this.#authToken
    );

    this.#lastHeartbeat = new Date();
    this.#heartbeatCount++;

    // Update heartbeat interval if server provides one
    if (response.nextHeartbeat) {
      this.#heartbeatInterval = response.nextHeartbeat;
    }

    // Process any commands received
    if (response.commands && response.commands.length > 0) {
      for (const command of response.commands) {
        void this.processCommand(command).catch((error: unknown) => {
          this.emit('command:error', { command, error });
        });
      }
    }

    this.emit('heartbeat', response);
    return response;
  }

  private async processCommand(command: DiagnosticCommand): Promise<void> {
    this.emit('command:received', command);

    // Command processing will be implemented in the next task
    // For now, just acknowledge receipt
    const result: DiagnosticResult = {
      commandId: command.id,
      deviceId: this.#config.deviceId,
      status: 'completed',
      results: {
        output: `Command ${command.type} acknowledged`,
      },
      executedAt: new Date().toISOString(),
      duration: 0,
    };

    await this.submitResult(result);
  }

  private async submitResult(result: DiagnosticResult): Promise<void> {
    if (!this.#authToken) {
      throw new Error('Not authenticated');
    }

    // In mock mode, simulate successful submission
    if (this.#config.mockMode) {
      console.log('🎭 Mock mode: Simulating result submission', result);
      this.emit('result:submitted', result);
      return;
    }

    await this.makeApiCall(
      `/api/v1/devices/${this.#config.deviceId}/diagnostic-results`,
      'POST',
      result,
      this.#authToken
    );

    this.emit('result:submitted', result);
  }

  private async makeApiCall<T>(
    endpoint: string,
    method: string,
    body?: unknown,
    token?: string,
    timeoutMs = 30000 // Default 30 second timeout
  ): Promise<T> {
    const url = new globalThis.URL(endpoint, this.#config.apiUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Create AbortController for timeout
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed: ${response.status} ${errorText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(
            `API call timed out after ${timeoutMs}ms: ${endpoint}`
          );
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getUptime(): number {
    if (!this.#startTime) {
      return 0;
    }
    return Date.now() - this.#startTime.getTime();
  }

  // Public getters
  getDeviceId(): string {
    return this.#config.deviceId;
  }

  getStatus(): DeviceStatus {
    return this.#status;
  }

  isConnected(): boolean {
    return this.#status === 'running' && this.#isRegistered;
  }

  isRegistered(): boolean {
    return this.#isRegistered;
  }

  getAuthToken(): string | null {
    return this.#authToken;
  }

  getHeartbeatInterval(): number {
    return this.#heartbeatInterval;
  }

  getHealthStatus(): HealthStatus {
    const status: HealthStatus = {
      status:
        this.#status === 'running'
          ? 'healthy'
          : this.#status === 'error'
            ? 'unhealthy'
            : 'degraded',
      uptime: this.getUptime(),
      heartbeatCount: this.#heartbeatCount,
      heartbeatErrors: this.#heartbeatErrors,
    };

    if (this.#lastHeartbeat) {
      status.lastHeartbeat = this.#lastHeartbeat.toISOString();
    }

    if (this.#status === 'error' && this.#lastError) {
      status.error = this.#lastError.message;
    }

    return status;
  }
}
