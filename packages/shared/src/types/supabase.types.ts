/**
 * Supabase Database Types
 *
 * Basic type definitions for the database schema
 * These should be generated from Supabase, but we'll define them manually for now
 */

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string;
          plan_type: 'basic' | 'pro' | 'enterprise';
          status: 'active' | 'inactive' | 'suspended';
          settings: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone: string;
          plan_type: 'basic' | 'pro' | 'enterprise';
          status?: 'active' | 'inactive' | 'suspended';
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          customer_id: string;
          email: string;
          role: 'admin' | 'user' | 'readonly';
          name: string;
          phone: string;
          is_active: boolean;
          last_login: string | null;
          preferences: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          email: string;
          role: 'admin' | 'user' | 'readonly';
          name: string;
          phone: string;
          is_active?: boolean;
          last_login?: string | null;
          preferences?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      devices: {
        Row: {
          id: string;
          customer_id: string;
          name: string;
          device_type: 'raspberry_pi' | 'router' | 'switch';
          mac_address: string;
          ip_address: string;
          location: string;
          status: 'online' | 'offline' | 'error';
          last_seen: string | null;
          config: Record<string, any>;
          metrics: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          name: string;
          device_type: 'raspberry_pi' | 'router' | 'switch';
          mac_address: string;
          ip_address: string;
          location: string;
          status: 'online' | 'offline' | 'error';
          last_seen?: string | null;
          config?: Record<string, any>;
          metrics?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['devices']['Insert']>;
      };
      diagnostic_sessions: {
        Row: {
          id: string;
          customer_id: string;
          device_id: string;
          user_id: string;
          session_type: string;
          status:
            | 'in_progress'
            | 'completed'
            | 'failed'
            | 'remediation_pending';
          started_at: string;
          ended_at: string | null;
          diagnostic_data: Record<string, any>;
          remediation_actions: any[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_id: string;
          user_id: string;
          session_type?: string;
          status:
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'failed'
            | 'remediation_pending';
          started_at: string;
          ended_at?: string | null;
          diagnostic_data?: Record<string, any>;
          remediation_actions?: any[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['diagnostic_sessions']['Insert']
        >;
      };
      network_diagnostics: {
        Row: {
          id: string;
          session_id: string;
          test_type: string;
          results: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          test_type: string;
          results: Record<string, any>;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['network_diagnostics']['Insert']
        >;
      };
      remediation_actions: {
        Row: {
          id: string;
          session_id: string;
          action_type: string;
          status: string;
          script: string | null;
          approved_by: string | null;
          executed_at: string | null;
          result: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          action_type: string;
          status: string;
          script?: string | null;
          approved_by?: string | null;
          executed_at?: string | null;
          result?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['remediation_actions']['Insert']
        >;
      };
      alerts: {
        Row: {
          id: string;
          customer_id: string;
          device_id: string | null;
          alert_type: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          message: string;
          details: Record<string, any>;
          acknowledged: boolean;
          acknowledged_by: string | null;
          resolved: boolean;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_id?: string | null;
          alert_type: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          message: string;
          details?: Record<string, any>;
          acknowledged?: boolean;
          acknowledged_by?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['alerts']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          customer_id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Record<string, any>;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Record<string, any>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
