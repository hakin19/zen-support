export interface ApiClientConfig {
  apiUrl: string;
  deviceId: string;
  deviceSecret: string;
  customerId: string;
  heartbeatInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  requestTimeout?: number;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
  deviceId: string;
}

export interface DeviceRegistrationRequest {
  device_id: string;
  customer_id: string;
  device_type?: string;
  firmware_version?: string;
  capabilities?: string[];
}

export interface DeviceRegistrationResponse {
  device_id: string;
  registered: boolean;
  customer_id: string;
  registration_date: string;
  configuration?: Record<string, unknown>;
}

export interface HeartbeatRequest {
  status: 'healthy' | 'degraded' | 'offline';
  metrics?: {
    cpu: number;
    memory: number;
    uptime: number;
  };
}

export interface HeartbeatResponse {
  acknowledged?: boolean;
  success?: boolean;
  status?: string;
  commands?: CommandMessage[];
  nextHeartbeat?: number;
  server_time?: string;
  timestamp?: string;
}

export interface CommandMessage {
  id: string;
  type: 'diagnostic' | 'configuration' | 'system' | 'custom';
  command: string;
  parameters?: Record<string, unknown>;
  timestamp: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  timeout_ms?: number;
}

export interface DiagnosticResult {
  command_id: string;
  device_id: string;
  type: string;
  status: 'success' | 'failure' | 'timeout' | 'error';
  result?: unknown;
  error?: string;
  executed_at: string;
  duration_ms: number;
  metadata?: Record<string, unknown>;
}

export interface DeviceMetrics {
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  network_stats?: NetworkStats;
  uptime_seconds?: number;
}

export interface NetworkStats {
  bytes_sent: number;
  bytes_received: number;
  packets_sent: number;
  packets_received: number;
  errors: number;
  dropped: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ApiClientEvents {
  connected: () => void;
  disconnected: (reason?: string) => void;
  reconnecting: (attempt: number) => void;
  error: (error: ApiClientError) => void;
  command: (command: CommandMessage) => void;
  'command:received': (command: CommandMessage) => void;
  configuration_update: (config: Record<string, unknown>) => void;
  'websocket:connected': () => void;
  'websocket:disconnected': (reason?: any) => void;
  'websocket:error': (error: Error) => void;
  'device:status': (status: any) => void;
  'heartbeat:success': (response: any) => void;
  'heartbeat:error': (error: any) => void;
}

export class ApiClientError extends Error {
  public code?: string;
  public originalError?: Error;
  public retryable: boolean;

  constructor(
    message: string,
    code?: string,
    originalError?: Error,
    retryable = true
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.originalError = originalError;
    this.retryable = retryable;
  }
}

// WebSocket Client Types
export interface WebSocketClientOptions {
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  maxReconnectInterval?: number;
  pingInterval?: number;
  pongTimeout?: number;
  queueMessages?: boolean;
  maxQueueSize?: number;
}

export interface WebSocketMessage {
  type:
    | 'connected'
    | 'heartbeat'
    | 'command'
    | 'command_result'
    | 'error'
    | string;
  payload?: any;
}

export interface WebSocketMetrics {
  messagesSent: number;
  messagesReceived: number;
  connectionUptime: number;
  reconnectCount: number;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
}
