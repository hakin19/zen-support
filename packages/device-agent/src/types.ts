/**
 * Device Agent Type Definitions
 */

export interface DeviceConfig {
  readonly deviceId: string;
  readonly deviceSecret: string;
  readonly apiUrl: string;
  readonly customerId: string;
  readonly heartbeatInterval?: number;
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
  readonly mockMode?: boolean;
  // Retry and backoff configurations
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly maxReconnectAttempts?: number;
  readonly maxReconnectInterval?: number;
  // WebSocket configurations
  readonly websocketReconnectInterval?: number;
  readonly websocketMaxRetries?: number;
}

export type DeviceStatus =
  | 'initialized'
  | 'running'
  | 'stopped'
  | 'error'
  | 'recovering';

export interface RegistrationResponse {
  token: string;
  expiresIn: number;
  heartbeatInterval: number;
}

export interface HeartbeatResponse {
  acknowledged: boolean;
  commands: DiagnosticCommand[];
  nextHeartbeat: number;
}

export interface DiagnosticCommand {
  id: string;
  type:
    | 'ping'
    | 'traceroute'
    | 'dns'
    | 'connectivity'
    | 'custom'
    | 'port_check'
    | 'network_scan'
    | 'bandwidth_test'
    | string;
  payload?: {
    target?: string;
    domain?: string;
    host?: string;
    port?: number;
    count?: number;
    timeout?: number;
    recordType?: string;
    customCommand?: string;
  };
  parameters?: {
    target?: string;
    count?: number;
    timeout?: number;
    port?: number;
    recordType?: string;
    customCommand?: string;
  };
  priority?: 'low' | 'normal' | 'high';
  createdAt: string;
  expiresAt?: string;
  claimToken?: string; // Token received when claiming the command
  visibleUntil?: string; // Command visibility timeout
}

export interface DiagnosticResult {
  commandId: string;
  deviceId: string;
  status: 'completed' | 'failed' | 'timeout';
  results: {
    output?: string;
    metrics?: Record<string, unknown>;
    error?: string;
  };
  executedAt: string;
  duration: number;
  claimToken?: string; // Token to include when submitting the result
}

export interface CommandResultSubmission {
  claimToken: string;
  status: 'success' | 'failure' | 'timeout';
  output?: string;
  error?: string;
  executedAt: string;
  duration: number;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  lastHeartbeat?: string;
  heartbeatCount: number;
  heartbeatErrors: number;
  error?: string;
}

export interface AgentMessage {
  deviceId: string;
  timestamp: string;
  type: 'heartbeat' | 'diagnostic_result' | 'status_update' | 'error';
  payload: unknown;
  sequenceNumber: number;
}
