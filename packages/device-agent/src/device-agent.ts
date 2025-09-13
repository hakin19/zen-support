import { EventEmitter } from 'events';

import { ApiClient } from './api/api-client.js';
import { getDeviceId } from './utils/device-id-generator.js';

import type {
  DeviceConfig,
  DeviceStatus,
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
  #apiClient: ApiClient | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #heartbeatInterval: number;
  #isRegistered = false;
  #startTime: Date | null = null;
  #lastHeartbeat: Date | null = null;
  #heartbeatCount = 0;
  #heartbeatErrors = 0;
  #lastError: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #mockSimulator: any = null; // Use any to avoid type issues with dynamic import
  #websocketState: 'connected' | 'disconnected' = 'disconnected';

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

    // Initialize API client if not in mock mode
    if (!config.mockMode) {
      this.#apiClient = new ApiClient({
        apiUrl: config.apiUrl,
        deviceId: configWithDeviceId.deviceId,
        deviceSecret: config.deviceSecret,
        customerId: config.customerId,
        heartbeatInterval: this.#heartbeatInterval,
      });
      this.setupApiClientEventHandlers();
    }

    // Initialize mock simulator if in mock mode
    if (config.mockMode) {
      this.initializeMockSimulator().catch(error => {
        console.error('Failed to initialize mock simulator:', error);
      });
    }
  }

  private setupApiClientEventHandlers(): void {
    if (!this.#apiClient) return;

    // Forward API client events
    this.#apiClient.on('connected', () => {
      this.emit('connected');
    });

    this.#apiClient.on('disconnected', () => {
      this.emit('disconnected');
    });

    this.#apiClient.on('error', error => {
      // Store API client errors but avoid emitting the generic 'error' event
      // to prevent unhandled exceptions in tests when no listeners are attached.
      this.#lastError = error;
      this.emit('api:error', error);
    });

    // WebSocket events
    this.#apiClient.on('websocket:connected', () => {
      console.log('🔌 WebSocket connected');
      this.#websocketState = 'connected';
      this.emit('websocket:connected');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#apiClient.on('websocket:disconnected', (reason: any) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.#websocketState = 'disconnected';
      this.emit('websocket:disconnected', reason);
    });

    // Command events - convert CommandMessage to DiagnosticCommand format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#apiClient.on('command', (command: any) => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const diagnosticCommand: DiagnosticCommand = {
        id: command.id,
        type: command.type,
        payload: command.parameters ?? {},
        createdAt: command.timestamp,
        claimToken: command.claimToken,
      };
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      console.log(
        `📋 Command received via WebSocket: ${diagnosticCommand.type} (${diagnosticCommand.id})`
      );
      this.emit('command:received', diagnosticCommand);
      // Process the command
      void this.processCommand(diagnosticCommand).catch((error: unknown) => {
        this.emit('command:error', { command: diagnosticCommand, error });
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#apiClient.on('command:received', (command: any) => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const diagnosticCommand: DiagnosticCommand = {
        id: command.id,
        type: command.type,
        payload: command.parameters ?? {},
        createdAt: command.timestamp,
        claimToken: command.claimToken,
      };
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      this.emit('command:received', diagnosticCommand);
      void this.processCommand(diagnosticCommand).catch((error: unknown) => {
        this.emit('command:error', { command: diagnosticCommand, error });
      });
    });
  }

  private async initializeMockSimulator(): Promise<void> {
    if (!this.#config.mockMode) return;

    try {
      const { MockDeviceSimulator } = await import(
        './utils/mock-device-simulator.js'
      );
      this.#mockSimulator = new MockDeviceSimulator(this.#config.deviceId);
      console.log(
        '🎭 Mock simulator initialized for device:',
        this.#config.deviceId
      );
    } catch (error) {
      console.error('Failed to load mock simulator:', error);
    }
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

      // Start heartbeat in all modes so the API reflects online status promptly in integration tests
      // (API client handles scheduling and backoff internally)
      this.startHeartbeat();

      this.emit('started');
    } catch (error) {
      this.#status = 'error';
      this.#lastError = error as Error;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Immediately transitions the agent to 'stopped' and performs cleanup in the background.
   *
   * Notes:
   * - Synchronous API for tests and callers that only need state transition.
   * - For deterministic cleanup (including offline signal), use stopAsync().
   */
  stop(): void {
    if (this.#status !== 'running') {
      // Synchronous throw so tests using toThrow() work as expected
      throw new Error('Agent is not running');
    }

    this.emit('stopping');

    // Update state immediately so callers observe stopped state synchronously
    this.#status = 'stopped';
    this.#isRegistered = false;
    this.emit('stopped');

    // Perform cleanup asynchronously (best-effort) to avoid blocking
    void this.performCleanup();
  }

  /**
   * Graceful, awaited shutdown path: transitions to 'stopped' and awaits cleanup.
   * Use this when you need to ensure offline signal and resource disposal are complete.
   */
  async stopAsync(): Promise<void> {
    if (this.#status !== 'running') {
      throw new Error('Agent is not running');
    }

    this.emit('stopping');

    // Mirror stop() immediate state transition for consistency
    this.#status = 'stopped';
    this.#isRegistered = false;

    await this.performCleanup();

    // Emit 'stopped' after cleanup completes (deterministic for callers)
    this.emit('stopped');
  }

  private async performCleanup(): Promise<void> {
    // Best-effort: mark device offline
    try {
      if (this.#apiClient) {
        const token = this.#apiClient.getAuthToken();
        if (token) {
          await fetch(`${this.#config.apiUrl}/api/v1/device/heartbeat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Device-Session': token,
            },
            body: JSON.stringify({ status: 'offline' }),
          });
        }
      }
    } catch {
      // Ignore offline signal errors on shutdown
    }

    this.stopHeartbeat();

    // Stop API client
    if (this.#apiClient) {
      this.#apiClient.stop();
    }

    // Cleanup mock simulator if it exists
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (this.#mockSimulator?.destroy) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.#mockSimulator.destroy();
      this.#mockSimulator = null;
    }
  }

  shutdown(): void {
    if (this.#status === 'running') {
      this.stop();
    } else {
      // Cleanup resources even if not running
      if (this.#apiClient) {
        this.#apiClient.stop();
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (this.#mockSimulator?.destroy) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        this.#mockSimulator.destroy();
        this.#mockSimulator = null;
      }
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
    // In mock mode, simulate successful authentication
    if (this.#config.mockMode) {
      console.log('🎭 Mock mode: Simulating authentication');
      this.#isRegistered = true;
      this.emit('registered');
      return;
    }

    if (!this.#apiClient) {
      throw new Error('API client not initialized');
    }

    // Authenticate with the API (single retry on transient errors)
    const attempts = 2;
    let authenticated = false;
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      authenticated = await this.#apiClient.authenticate();
      if (authenticated) break;
      const last = this.#apiClient.getLastError();
      lastError = last?.originalError ?? last ?? null;
      const retryable = last?.retryable ?? true;
      if (!retryable) break; // Do not retry non-retryable errors (e.g., 4xx)
    }
    if (!authenticated) {
      const last = this.#apiClient.getLastError();
      const msg =
        // Prefer the earliest captured original error message for clarity in tests
        lastError?.message ??
        last?.originalError?.message ??
        last?.message ??
        'Authentication failed';
      throw new Error(msg);
    }

    this.#isRegistered = true;

    // Try to establish WebSocket connection after successful authentication
    // This is optional - the agent can still work with HTTP polling if WS fails
    try {
      await this.#apiClient.connectWebSocket();
      console.log('✅ WebSocket connection established');
    } catch (error) {
      // Log WebSocket connection error but don't fail
      // The agent can still work with HTTP polling
      console.error(
        '⚠️  WebSocket connection failed, falling back to HTTP polling:',
        error
      );
    }

    // Heartbeat scheduling is managed by DeviceAgent.startHeartbeat() for tests
    // Do not auto-start here to avoid duplicate schedulers

    this.emit('registered');
  }

  private startHeartbeat(): void {
    // Clear any existing local scheduler
    this.stopHeartbeat();

    const runCycle = async (): Promise<void> => {
      try {
        await this.sendHeartbeat();
        // Schedule next cycle using server-provided interval if available
        if (this.#status === 'running') {
          this.#heartbeatTimer = setTimeout(
            () => void runCycle(),
            this.#heartbeatInterval
          );
        }
        return;
      } catch (error) {
        // sendHeartbeat throws only in mock mode; non-mock returns null on failure
        this.#heartbeatErrors++;
        this.emit('heartbeat:error', error);
        if (this.#status === 'running') {
          this.#heartbeatTimer = setTimeout(() => void runCycle(), 5000);
        }
        return;
      }
    };

    // Non-mock: perform a single immediate cycle with re-auth handling when needed
    if (!this.#config.mockMode && this.#apiClient) {
      const apiClient = this.#apiClient; // Capture the non-null value
      const cycleNonMock = async (): Promise<void> => {
        const result = await apiClient.sendHeartbeat();
        if (result) {
          // Successful heartbeat; update counters and schedule next
          this.#lastHeartbeat = new Date();
          this.#heartbeatCount++;
          // Update interval if server suggests a new one
          if (typeof result.nextHeartbeat === 'number') {
            this.#heartbeatInterval = result.nextHeartbeat;
          }
          this.emit('heartbeat', {
            acknowledged: result.acknowledged ?? true,
            commands: [],
            nextHeartbeat: result.nextHeartbeat ?? this.#heartbeatInterval,
          } satisfies HeartbeatResponse);
          if (this.#status === 'running') {
            this.#heartbeatTimer = setTimeout(
              () => void cycleNonMock(),
              this.#heartbeatInterval
            );
          }
          return;
        }

        // Failure path. Inspect last error to decide if re-auth is needed.
        const handled = await this.handleHeartbeatFailure();
        if (!handled) {
          // Non-401 failure already emitted by helper; just exit this cycle
          return;
        }
      };

      // Kick off immediately (via zero-delay timeout to play nice with fake timers)
      this.#heartbeatTimer = setTimeout(() => void cycleNonMock(), 0);
      return;
    }

    // Mock mode: immediate cycle using local handler
    this.#heartbeatTimer = setTimeout(() => void runCycle(), 0);
  }

  /**
   * Handles heartbeat failures, attempting quick re-auth on 401 responses.
   * Returns true if the failure was handled (either recovered or events emitted),
   * false if no explicit handling was needed.
   */
  private async handleHeartbeatFailure(): Promise<boolean> {
    if (!this.#apiClient) return false;
    const last = this.#apiClient.getLastError();
    const is401 = Boolean(
      last?.code === 'HTTP_401' || /401/.test(last?.message ?? '')
    );

    if (!is401) {
      // Non-401 failure: emit heartbeat error and do not attempt re-auth
      this.#heartbeatErrors++;
      this.emit('heartbeat:error', last ?? new Error('Heartbeat failed'));
      return false;
    }

    // Quick re-auth retries tailored for tests
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      const backoff = 100 * Math.pow(2, i); // 100ms, 200ms, 400ms

      await new Promise(resolve => setTimeout(resolve, backoff));

      const ok = await this.#apiClient.refreshToken();
      if (ok) {
        // Retry heartbeat immediately

        const retry = await this.#apiClient.sendHeartbeat();
        if (retry) {
          this.#lastHeartbeat = new Date();
          this.#heartbeatCount++;
          if (typeof retry.nextHeartbeat === 'number') {
            this.#heartbeatInterval = retry.nextHeartbeat;
          }
          this.emit('heartbeat', {
            acknowledged: retry.acknowledged ?? true,
            commands: [],
            nextHeartbeat: retry.nextHeartbeat ?? this.#heartbeatInterval,
          } satisfies HeartbeatResponse);
          if (this.#status === 'running') {
            this.#heartbeatTimer = setTimeout(
              () => void this.startHeartbeat(),
              this.#heartbeatInterval
            );
          }
          return true;
        }
      }
    }

    // Re-auth failed after attempts
    this.#heartbeatErrors++;
    this.emit('auth:failed');
    this.emit('heartbeat:error', last ?? new Error('Authentication failed'));
    return true;
  }

  private stopHeartbeat(): void {
    // Stop local heartbeat timer
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    // Also stop any ApiClient-managed heartbeat if it was started elsewhere
    if (this.#apiClient) {
      this.#apiClient.stopHeartbeat();
    }
  }

  private async sendHeartbeat(): Promise<HeartbeatResponse> {
    // Use API client for real heartbeats
    if (!this.#config.mockMode && this.#apiClient) {
      const response = await this.#apiClient.sendHeartbeat();
      if (response) {
        this.#lastHeartbeat = new Date();
        this.#heartbeatCount++;
        // Convert API response to internal HeartbeatResponse format
        const heartbeatResponse: HeartbeatResponse = {
          acknowledged: response.acknowledged ?? response.success ?? true,
          commands: [],
          nextHeartbeat: response.nextHeartbeat ?? this.#heartbeatInterval,
        };
        // Update interval from server response if provided
        if (typeof heartbeatResponse.nextHeartbeat === 'number') {
          this.#heartbeatInterval = heartbeatResponse.nextHeartbeat;
        }
        this.emit('heartbeat', heartbeatResponse);
        return heartbeatResponse;
      }
      throw new Error('Failed to send heartbeat');
    }

    // In mock mode, simulate successful heartbeat with mock metrics
    if (this.#config.mockMode) {
      // Get metrics from mock simulator if available
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const metrics = this.#mockSimulator?.getMetrics() ?? {
        cpu: 25,
        memory: 512,
        uptime: this.getUptime(),
        network: {
          latency: 50,
          packetLoss: 0,
        },
      };

      const mockResponse: HeartbeatResponse = {
        acknowledged: true,
        commands: this.generateMockCommands(),
        nextHeartbeat: this.#heartbeatInterval,
      };

      console.log('🎭 Mock heartbeat sent with metrics:', metrics);
      this.#lastHeartbeat = new Date();
      this.#heartbeatCount++;
      this.emit('heartbeat', mockResponse);
      return mockResponse;
    }

    // This should not be reached since non-mock mode uses ApiClient
    throw new Error(
      'Heartbeat should be handled by ApiClient in non-mock mode'
    );
  }

  private generateMockCommands(): DiagnosticCommand[] {
    // Randomly generate commands 10% of the time in mock mode
    if (Math.random() > 0.1) {
      return [];
    }

    const commands = [
      'ping',
      'traceroute',
      'dns',
      'port_check',
      'network_scan',
    ];
    const commandType = commands[Math.floor(Math.random() * commands.length)];

    return [
      {
        id: `cmd-${Date.now()}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        type: commandType as any, // Type is already validated from the array
        payload: {
          target: '8.8.8.8',
          domain: 'example.com',
          host: 'localhost',
          port: 80,
        },
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private async processCommand(command: DiagnosticCommand): Promise<void> {
    this.emit('command:received', command);

    // In mock mode, use the mock simulator to execute commands
    if (this.#config.mockMode && this.#mockSimulator) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const result = await this.#mockSimulator.executeCommand(command);
      // Include claimToken if present
      if (command.claimToken) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result.claimToken = command.claimToken;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await this.submitResult(result);
      return;
    }

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
      claimToken: command.claimToken, // Include claimToken if present
    };

    await this.submitResult(result);
  }

  private async submitResult(result: DiagnosticResult): Promise<void> {
    // In mock mode, simulate successful submission
    if (this.#config.mockMode) {
      console.log('🎭 Mock mode: Simulating result submission', result);
      this.emit('result:submitted', result);
      return;
    }

    // Use API client to submit result
    if (!this.#apiClient) {
      throw new Error('API client not initialized');
    }

    await this.#apiClient.submitDiagnosticResult(result);
    this.emit('result:submitted', result);
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
    return this.#apiClient?.getAuthToken() ?? null;
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
      websocket: this.#websocketState,
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
