/**
 * Aizen vNE Shared Types and Utilities
 * Common types and utilities used across packages
 */

// Common types
export interface NetworkDiagnostic {
  id: string;
  timestamp: Date;
  deviceId: string;
  type: DiagnosticType;
  data: Record<string, unknown>;
  status: DiagnosticStatus;
}

export enum DiagnosticType {
  PING = 'ping',
  TRACEROUTE = 'traceroute',
  DNS_LOOKUP = 'dns_lookup',
  PORT_SCAN = 'port_scan',
  BANDWIDTH_TEST = 'bandwidth_test',
}

export enum DiagnosticStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Utility functions
export function generateId(): string {
  // Example ES2022: Array.at() method
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4, 12];

  return segments
    .map(length =>
      Array.from({ length }, () =>
        chars.at(Math.floor(Math.random() * chars.length))
      ).join('')
    )
    .join('-');
}

// Type guards
export function isDiagnosticType(value: unknown): value is DiagnosticType {
  return (
    typeof value === 'string' &&
    Object.values(DiagnosticType).includes(value as DiagnosticType)
  );
}

// Constants
export const API_VERSION = 'v1' as const;
export const DEFAULT_TIMEOUT = 30_000; // ES2022: numeric separators
