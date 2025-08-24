/**
 * Database Types for Zen & Zen Network Support (Aizen vNE)
 * Auto-generated from Supabase schema
 *
 * To regenerate: Run migrations and update this file
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      alerts: {
        Row: {
          id: string;
          customer_id: string;
          device_id: string | null;
          alert_type: string;
          severity: string;
          title: string;
          description: string | null;
          is_resolved: boolean;
          resolved_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_id?: string | null;
          alert_type: string;
          severity?: string;
          title: string;
          description?: string | null;
          is_resolved?: boolean;
          resolved_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          device_id?: string | null;
          alert_type?: string;
          severity?: string;
          title?: string;
          description?: string | null;
          is_resolved?: boolean;
          resolved_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          customer_id: string | null;
          user_id: string | null;
          action: Database['public']['Enums']['audit_action'];
          resource_type: string;
          resource_id: string | null;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          user_id?: string | null;
          action: Database['public']['Enums']['audit_action'];
          resource_type: string;
          resource_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          user_id?: string | null;
          action?: Database['public']['Enums']['audit_action'];
          resource_type?: string;
          resource_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          address: string | null;
          subscription_tier: string;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          address?: string | null;
          subscription_tier?: string;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          address?: string | null;
          subscription_tier?: string;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      devices: {
        Row: {
          id: string;
          customer_id: string;
          device_id: string;
          name: string;
          type: string;
          status: Database['public']['Enums']['device_status'];
          location: string | null;
          network_info: Json;
          configuration: Json;
          last_heartbeat_at: string | null;
          registered_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_id: string;
          name: string;
          type?: string;
          status?: Database['public']['Enums']['device_status'];
          location?: string | null;
          network_info?: Json;
          configuration?: Json;
          last_heartbeat_at?: string | null;
          registered_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          device_id?: string;
          name?: string;
          type?: string;
          status?: Database['public']['Enums']['device_status'];
          location?: string | null;
          network_info?: Json;
          configuration?: Json;
          last_heartbeat_at?: string | null;
          registered_at?: string;
          updated_at?: string;
        };
      };
      diagnostic_sessions: {
        Row: {
          id: string;
          customer_id: string;
          device_id: string;
          user_id: string | null;
          session_type: string;
          status: Database['public']['Enums']['diagnostic_status'];
          issue_description: string | null;
          diagnostic_data: Json;
          ai_analysis: Json;
          resolution_notes: string | null;
          mttr_minutes: number | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_id: string;
          user_id?: string | null;
          session_type: string;
          status?: Database['public']['Enums']['diagnostic_status'];
          issue_description?: string | null;
          diagnostic_data?: Json;
          ai_analysis?: Json;
          resolution_notes?: string | null;
          mttr_minutes?: number | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          device_id?: string;
          user_id?: string | null;
          session_type?: string;
          status?: Database['public']['Enums']['diagnostic_status'];
          issue_description?: string | null;
          diagnostic_data?: Json;
          ai_analysis?: Json;
          resolution_notes?: string | null;
          mttr_minutes?: number | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      network_diagnostics: {
        Row: {
          id: string;
          device_id: string;
          session_id: string | null;
          diagnostic_type: string;
          target: string | null;
          result: Json;
          is_anomaly: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          session_id?: string | null;
          diagnostic_type: string;
          target?: string | null;
          result: Json;
          is_anomaly?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string;
          session_id?: string | null;
          diagnostic_type?: string;
          target?: string | null;
          result?: Json;
          is_anomaly?: boolean;
          created_at?: string;
        };
      };
      remediation_actions: {
        Row: {
          id: string;
          session_id: string;
          action_type: string;
          description: string;
          script_content: string | null;
          risk_level: string;
          status: Database['public']['Enums']['remediation_status'];
          approved_by: string | null;
          approved_at: string | null;
          executed_at: string | null;
          execution_result: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          action_type: string;
          description: string;
          script_content?: string | null;
          risk_level?: string;
          status?: Database['public']['Enums']['remediation_status'];
          approved_by?: string | null;
          approved_at?: string | null;
          executed_at?: string | null;
          execution_result?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          action_type?: string;
          description?: string;
          script_content?: string | null;
          risk_level?: string;
          status?: Database['public']['Enums']['remediation_status'];
          approved_by?: string | null;
          approved_at?: string | null;
          executed_at?: string | null;
          execution_result?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          customer_id: string;
          full_name: string | null;
          phone: string | null;
          role: string;
          is_active: boolean;
          last_login_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          customer_id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          full_name?: string | null;
          phone?: string | null;
          role?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      analyze_table_health: {
        Args: Record<string, never>;
        Returns: Array<{
          table_name: string;
          row_count: number;
          total_size: string;
          index_size: string;
          toast_size: string;
          needs_vacuum: boolean;
          needs_analyze: boolean;
        }>;
      };
      get_user_customer_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      handle_new_user: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      handle_user_delete: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      has_role: {
        Args: {
          required_role: string;
        };
        Returns: boolean;
      };
      invite_user_to_customer: {
        Args: {
          inviter_user_id: string;
          invited_email: string;
          customer_id: string;
          user_role?: string;
        };
        Returns: Json;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      update_updated_at_column: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      validate_phone_number: {
        Args: {
          phone_number: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      audit_action:
        | 'create'
        | 'read'
        | 'update'
        | 'delete'
        | 'authenticate'
        | 'approve'
        | 'reject';
      device_status: 'online' | 'offline' | 'error' | 'maintenance';
      diagnostic_status: 'pending' | 'in_progress' | 'completed' | 'failed';
      remediation_status:
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'executed'
        | 'failed';
    };
    CompositeTypes: Record<string, never>;
  };
}

// Helper types for easier usage
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

// Convenience type exports
export type Customer = Tables<'customers'>;
export type User = Tables<'users'>;
export type Device = Tables<'devices'>;
export type DiagnosticSession = Tables<'diagnostic_sessions'>;
export type RemediationAction = Tables<'remediation_actions'>;
export type AuditLog = Tables<'audit_logs'>;
export type NetworkDiagnostic = Tables<'network_diagnostics'>;
export type Alert = Tables<'alerts'>;

export type DeviceStatus = Enums<'device_status'>;
export type DiagnosticStatus = Enums<'diagnostic_status'>;
export type RemediationStatus = Enums<'remediation_status'>;
export type AuditAction = Enums<'audit_action'>;
