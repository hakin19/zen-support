/**
 * Aizen vNE Shared Types and Utilities
 * Common types and utilities used across packages
 */

// Export Supabase client and utilities
export {
  supabase,
  supabaseAdmin,
  getSupabase,
  getSupabaseAdmin,
  createSupabaseClient,
  auth,
  db,
  realtime,
  storage,
} from './lib/supabase';

// Export database types - prefer generated types over manually maintained ones
export type { Database, Json } from './types/database.generated';
// Keep the old Database interface renamed to avoid confusion
export type { Database as LegacyDatabase } from './types/supabase.types';

// Export User type based on Supabase auth and our user_roles table
export interface User {
  id: string;
  email?: string;
  role?: 'viewer' | 'operator' | 'admin' | 'owner' | 'super_admin';
  customer_id?: string;
  created_at?: string;
  updated_at?: string;
}

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

// Export HTTPS server utilities
export {
  createServers,
  startServers,
  shutdownServers,
  getServerConfig,
  type HttpsServerConfig,
  type ServerInstances,
} from './utils/https-server';
