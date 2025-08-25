/**
 * Fixture Types
 *
 * Types for test fixtures that ensure all required fields are present
 */

import type { Database } from '../../types/supabase.types';

// Base types from Supabase
type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type DiagnosticSessionInsert =
  Database['public']['Tables']['diagnostic_sessions']['Insert'];

// Fixture types with required IDs
export type CustomerFixture = Required<Pick<CustomerInsert, 'id'>> &
  CustomerInsert;
export type UserFixture = Required<Pick<UserInsert, 'id'>> & UserInsert;
export type DeviceFixture = Required<Pick<DeviceInsert, 'id'>> & DeviceInsert;
export type DiagnosticSessionFixture = Required<
  Pick<DiagnosticSessionInsert, 'id'>
> &
  DiagnosticSessionInsert;

// Helper type to ensure ID is always present
export type WithRequiredId<T extends { id?: string }> = T & { id: string };
