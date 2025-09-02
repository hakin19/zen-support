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
  type: 'ping' | 'traceroute' | 'dns' | 'connectivity' | 'custom';
  parameters: {
    target?: string;
    count?: number;
    timeout?: number;
    port?: number;
    recordType?: string;
    customCommand?: string;
  };
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  expiresAt: string;
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
