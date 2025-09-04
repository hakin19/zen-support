import type { WebSocketConnectionManager } from '../services/websocket-connection-manager';

// WebSocket message types for type safety
export interface DeviceClaimCommandMessage {
  type: 'claim_command';
  requestId?: string;
}

export interface DeviceCommandResultMessage {
  type: 'command_result';
  commandId: string;
  claimToken: string;
  status?: string;
  output?: string;
  error?: string;
  executedAt?: string;
  duration?: number;
  requestId?: string;
}

export interface DeviceHeartbeatMessage {
  type: 'heartbeat';
  requestId?: string;
}

export interface DeviceStatusUpdateMessage {
  type: 'status_update';
  status: Record<string, unknown>;
  requestId?: string;
}

export type DeviceMessage =
  | DeviceClaimCommandMessage
  | DeviceCommandResultMessage
  | DeviceHeartbeatMessage
  | DeviceStatusUpdateMessage;

export interface SessionApprovalMessage {
  type: 'approve_session';
  sessionId: string;
  deviceId: string;
  requestId?: string;
}

export interface GetSystemInfoMessage {
  type: 'get_system_info';
  deviceId: string;
  requestId?: string;
}

export interface SendCommandMessage {
  type: 'send_command';
  deviceId: string;
  commandType: string;
  payload?: Record<string, unknown>;
  priority?: number;
  requestId?: string;
}

export interface JoinRoomsMessage {
  type: 'join_rooms';
  requestId?: string;
}

export type CustomerMessage =
  | SessionApprovalMessage
  | GetSystemInfoMessage
  | SendCommandMessage
  | JoinRoomsMessage;

// Extend FastifyInstance to include WebSocket connection manager
declare module 'fastify' {
  interface FastifyInstance {
    websocketConnections?: WebSocketConnectionManager;
  }
}
