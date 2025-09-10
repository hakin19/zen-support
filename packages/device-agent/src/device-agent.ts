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
  #mockSimulator: any = null; // Use any to avoid type issues with dynamic import

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
      this.#lastError = error;
      this.emit('error', error);
    });

    // WebSocket events
    this.#apiClient.on('websocket:connected', () => {
      console.log('🔌 WebSocket connected');
      this.emit('websocket:connected');
    });

    this.#apiClient.on('websocket:disconnected', (reason: any) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.emit('websocket:disconnected', reason);
    });

    // Command events - convert CommandMessage to DiagnosticCommand format
    this.#apiClient.on('command', (command: any) => {
      const diagnosticCommand: DiagnosticCommand = {
        id: command.id,
        type: command.type,
        payload: command.parameters ?? {},
        createdAt: command.timestamp,
        claimToken: command.claimToken,
      };
      console.log(
        `📋 Command received via WebSocket: ${diagnosticCommand.type} (${diagnosticCommand.id})`
      );
      this.emit('command:received', diagnosticCommand);
      // Process the command
      void this.processCommand(diagnosticCommand).catch((error: unknown) => {
        this.emit('command:error', { command: diagnosticCommand, error });
      });
    });

    this.#apiClient.on('command:received', (command: any) => {
      const diagnosticCommand: DiagnosticCommand = {
        id: command.id,
        type: command.type,
        payload: command.parameters ?? {},
        createdAt: command.timestamp,
        claimToken: command.claimToken,
      };
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

    // Stop API client
    if (this.#apiClient) {
      this.#apiClient.stop();
    }

    // Cleanup mock simulator if it exists
    if (this.#mockSimulator?.destroy) {
      this.#mockSimulator.destroy();
      this.#mockSimulator = null;
    }

    this.#status = 'stopped';
    this.#isRegistered = false;

    this.emit('stopped');
  }

  shutdown(): void {
    if (this.#status === 'running') {
      this.stop();
    } else {
      // Cleanup resources even if not running
      if (this.#apiClient) {
        this.#apiClient.stop();
      }
      if (this.#mockSimulator?.destroy) {
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

    // Authenticate with the API
    const authenticated = await this.#apiClient.authenticate();
    if (!authenticated) {
      throw new Error('Authentication failed');
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

    // Start API client heartbeat
    this.#apiClient.startHeartbeat();

    this.emit('registered');
  }

  private startHeartbeat(): void {
    // In mock mode, handle heartbeat locally
    if (this.#config.mockMode) {
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
    // Otherwise, heartbeat is handled by ApiClient
  }

  private stopHeartbeat(): void {
    // Stop local heartbeat timer if in mock mode
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    // Stop API client heartbeat if not in mock mode
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
        this.emit('heartbeat', heartbeatResponse);
        return heartbeatResponse;
      }
      throw new Error('Failed to send heartbeat');
    }

    // In mock mode, simulate successful heartbeat with mock metrics
    if (this.#config.mockMode) {
      // Get metrics from mock simulator if available
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
      const result = await this.#mockSimulator.executeCommand(command);
      // Include claimToken if present
      if (command.claimToken) {
        result.claimToken = command.claimToken;
      }
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
