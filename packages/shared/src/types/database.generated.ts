export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* eslint-disable */
export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_prompts: {
        Row: {
          category: string | null;
          created_at: string | null;
          created_by: string;
          customer_id: string;
          id: string;
          is_active: boolean | null;
          metadata: Json | null;
          name: string;
          template: string;
          updated_at: string | null;
          variables: Json | null;
          version: number;
        };
        Insert: {
          category?: string | null;
          created_at?: string | null;
          created_by: string;
          customer_id: string;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          name: string;
          template: string;
          updated_at?: string | null;
          variables?: Json | null;
          version?: number;
        };
        Update: {
          category?: string | null;
          created_at?: string | null;
          created_by?: string;
          customer_id?: string;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          name?: string;
          template?: string;
          updated_at?: string | null;
          variables?: Json | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_prompts_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_ai_prompts_customer';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      alerts: {
        Row: {
          alert_type: string;
          created_at: string | null;
          customer_id: string;
          description: string | null;
          device_id: string | null;
          id: string;
          is_resolved: boolean | null;
          metadata: Json | null;
          resolved_at: string | null;
          severity: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          alert_type: string;
          created_at?: string | null;
          customer_id: string;
          description?: string | null;
          device_id?: string | null;
          id?: string;
          is_resolved?: boolean | null;
          metadata?: Json | null;
          resolved_at?: string | null;
          severity?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          alert_type?: string;
          created_at?: string | null;
          customer_id?: string;
          description?: string | null;
          device_id?: string | null;
          id?: string;
          is_resolved?: boolean | null;
          metadata?: Json | null;
          resolved_at?: string | null;
          severity?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          created_at: string | null;
          customer_id: string | null;
          details: Json | null;
          id: string;
          ip_address: unknown | null;
          resource_id: string | null;
          resource_type: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          created_at?: string | null;
          customer_id?: string | null;
          details?: Json | null;
          id?: string;
          ip_address?: unknown | null;
          resource_id?: string | null;
          resource_type: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          created_at?: string | null;
          customer_id?: string | null;
          details?: Json | null;
          id?: string;
          ip_address?: unknown | null;
          resource_id?: string | null;
          resource_type?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: string;
          created_at: string | null;
          id: string;
          metadata: Json | null;
          role: Database['public']['Enums']['message_role'];
          session_id: string;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          id?: string;
          metadata?: Json | null;
          role: Database['public']['Enums']['message_role'];
          session_id: string;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          id?: string;
          metadata?: Json | null;
          role?: Database['public']['Enums']['message_role'];
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_chat_messages_session';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_sessions: {
        Row: {
          closed_at: string | null;
          created_at: string | null;
          customer_id: string;
          id: string;
          metadata: Json | null;
          status: Database['public']['Enums']['chat_session_status'];
          title: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string | null;
          customer_id: string;
          id?: string;
          metadata?: Json | null;
          status?: Database['public']['Enums']['chat_session_status'];
          title?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string | null;
          customer_id?: string;
          id?: string;
          metadata?: Json | null;
          status?: Database['public']['Enums']['chat_session_status'];
          title?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_sessions_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_chat_sessions_customer';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          created_at: string | null;
          email: string;
          id: string;
          is_active: boolean | null;
          metadata: Json | null;
          name: string;
          phone: string | null;
          subscription_tier: string | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          email: string;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          name: string;
          phone?: string | null;
          subscription_tier?: string | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          email?: string;
          id?: string;
          is_active?: boolean | null;
          metadata?: Json | null;
          name?: string;
          phone?: string | null;
          subscription_tier?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      device_actions: {
        Row: {
          action_type: Database['public']['Enums']['action_type'];
          approved_at: string | null;
          approved_by: string | null;
          command: string;
          completed_at: string | null;
          created_at: string | null;
          device_id: string;
          error_message: string | null;
          executed_at: string | null;
          id: string;
          message_id: string | null;
          metadata: Json | null;
          parameters: Json | null;
          rejected_at: string | null;
          rejected_by: string | null;
          requested_by: string;
          result: string | null;
          session_id: string;
          status: Database['public']['Enums']['action_status'];
        };
        Insert: {
          action_type: Database['public']['Enums']['action_type'];
          approved_at?: string | null;
          approved_by?: string | null;
          command: string;
          completed_at?: string | null;
          created_at?: string | null;
          device_id: string;
          error_message?: string | null;
          executed_at?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          parameters?: Json | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          requested_by: string;
          result?: string | null;
          session_id: string;
          status?: Database['public']['Enums']['action_status'];
        };
        Update: {
          action_type?: Database['public']['Enums']['action_type'];
          approved_at?: string | null;
          approved_by?: string | null;
          command?: string;
          completed_at?: string | null;
          created_at?: string | null;
          device_id?: string;
          error_message?: string | null;
          executed_at?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          parameters?: Json | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          requested_by?: string;
          result?: string | null;
          session_id?: string;
          status?: Database['public']['Enums']['action_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'device_actions_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'device_actions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_device_actions_device';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_device_actions_session';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          configuration: Json | null;
          customer_id: string;
          device_id: string;
          id: string;
          last_heartbeat_at: string | null;
          location: string | null;
          name: string;
          network_info: Json | null;
          registered_at: string | null;
          status: Database['public']['Enums']['device_status'] | null;
          type: string | null;
          updated_at: string | null;
        };
        Insert: {
          configuration?: Json | null;
          customer_id: string;
          device_id: string;
          id?: string;
          last_heartbeat_at?: string | null;
          location?: string | null;
          name: string;
          network_info?: Json | null;
          registered_at?: string | null;
          status?: Database['public']['Enums']['device_status'] | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          configuration?: Json | null;
          customer_id?: string;
          device_id?: string;
          id?: string;
          last_heartbeat_at?: string | null;
          location?: string | null;
          name?: string;
          network_info?: Json | null;
          registered_at?: string | null;
          status?: Database['public']['Enums']['device_status'] | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      diagnostic_sessions: {
        Row: {
          ai_analysis: Json | null;
          completed_at: string | null;
          created_at: string | null;
          customer_id: string;
          device_id: string;
          diagnostic_data: Json | null;
          id: string;
          issue_description: string | null;
          mttr_minutes: number | null;
          resolution_notes: string | null;
          session_type: string;
          started_at: string | null;
          status: Database['public']['Enums']['diagnostic_status'] | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          ai_analysis?: Json | null;
          completed_at?: string | null;
          created_at?: string | null;
          customer_id: string;
          device_id: string;
          diagnostic_data?: Json | null;
          id?: string;
          issue_description?: string | null;
          mttr_minutes?: number | null;
          resolution_notes?: string | null;
          session_type: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['diagnostic_status'] | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          ai_analysis?: Json | null;
          completed_at?: string | null;
          created_at?: string | null;
          customer_id?: string;
          device_id?: string;
          diagnostic_data?: Json | null;
          id?: string;
          issue_description?: string | null;
          mttr_minutes?: number | null;
          resolution_notes?: string | null;
          session_type?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['diagnostic_status'] | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'diagnostic_sessions_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diagnostic_sessions_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diagnostic_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      network_diagnostics: {
        Row: {
          created_at: string | null;
          device_id: string;
          diagnostic_type: string;
          id: string;
          is_anomaly: boolean | null;
          result: Json;
          session_id: string | null;
          target: string | null;
        };
        Insert: {
          created_at?: string | null;
          device_id: string;
          diagnostic_type: string;
          id?: string;
          is_anomaly?: boolean | null;
          result: Json;
          session_id?: string | null;
          target?: string | null;
        };
        Update: {
          created_at?: string | null;
          device_id?: string;
          diagnostic_type?: string;
          id?: string;
          is_anomaly?: boolean | null;
          result?: Json;
          session_id?: string | null;
          target?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'network_diagnostics_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'network_diagnostics_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'diagnostic_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      remediation_actions: {
        Row: {
          action_type: string;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string | null;
          description: string;
          executed_at: string | null;
          execution_result: Json | null;
          id: string;
          risk_level: string | null;
          script_content: string | null;
          session_id: string;
          status: Database['public']['Enums']['remediation_status'] | null;
          updated_at: string | null;
        };
        Insert: {
          action_type: string;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          description: string;
          executed_at?: string | null;
          execution_result?: Json | null;
          id?: string;
          risk_level?: string | null;
          script_content?: string | null;
          session_id: string;
          status?: Database['public']['Enums']['remediation_status'] | null;
          updated_at?: string | null;
        };
        Update: {
          action_type?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          description?: string;
          executed_at?: string | null;
          execution_result?: Json | null;
          id?: string;
          risk_level?: string | null;
          script_content?: string | null;
          session_id?: string;
          status?: Database['public']['Enums']['remediation_status'] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'remediation_actions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'remediation_actions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'diagnostic_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string | null;
          created_by: string;
          customer_id: string;
          role: Database['public']['Enums']['user_role'];
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          created_by: string;
          customer_id: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string;
          customer_id?: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_user_roles_customer';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          customer_id: string;
          full_name: string | null;
          id: string;
          is_active: boolean | null;
          last_login_at: string | null;
          metadata: Json | null;
          phone: string | null;
          role: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          customer_id: string;
          full_name?: string | null;
          id: string;
          is_active?: boolean | null;
          last_login_at?: string | null;
          metadata?: Json | null;
          phone?: string | null;
          role?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          customer_id?: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_login_at?: string | null;
          metadata?: Json | null;
          phone?: string | null;
          role?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      analyze_table_health: {
        Args: Record<PropertyKey, never>;
        Returns: {
          index_size: string;
          needs_analyze: boolean;
          needs_vacuum: boolean;
          row_count: number;
          table_name: string;
          toast_size: string;
          total_size: string;
        }[];
      };
      archive_old_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      close_inactive_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      create_test_user: {
        Args: {
          p_auth_id: string;
          p_customer_id: string;
          p_full_name: string;
          p_phone?: string;
          p_role?: string;
        };
        Returns: string;
      };
      get_user_customer_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_user_role: {
        Args: { p_customer_id: string };
        Returns: Database['public']['Enums']['user_role'];
      };
      has_role: {
        Args: { required_role: string };
        Returns: boolean;
      };
      has_role_or_higher: {
        Args: {
          p_customer_id: string;
          p_min_role: Database['public']['Enums']['user_role'];
        };
        Returns: boolean;
      };
      invite_user_to_customer: {
        Args: {
          customer_id: string;
          invited_email: string;
          inviter_user_id: string;
          user_role?: string;
        };
        Returns: Json;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      validate_phone_number: {
        Args: { phone_number: string };
        Returns: boolean;
      };
    };
    Enums: {
      action_status:
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'executing'
        | 'completed'
        | 'failed'
        | 'cancelled';
      action_type:
        | 'diagnostic'
        | 'remediation'
        | 'configuration'
        | 'monitoring';
      audit_action:
        | 'create'
        | 'read'
        | 'update'
        | 'delete'
        | 'authenticate'
        | 'approve'
        | 'reject';
      chat_session_status: 'active' | 'archived' | 'closed';
      device_status: 'online' | 'offline' | 'error' | 'maintenance';
      diagnostic_status: 'pending' | 'in_progress' | 'completed' | 'failed';
      message_role: 'user' | 'assistant' | 'system' | 'error';
      remediation_status:
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'executed'
        | 'failed';
      user_role: 'owner' | 'admin' | 'viewer';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_status: [
        'pending',
        'approved',
        'rejected',
        'executing',
        'completed',
        'failed',
        'cancelled',
      ],
      action_type: ['diagnostic', 'remediation', 'configuration', 'monitoring'],
      audit_action: [
        'create',
        'read',
        'update',
        'delete',
        'authenticate',
        'approve',
        'reject',
      ],
      chat_session_status: ['active', 'archived', 'closed'],
      device_status: ['online', 'offline', 'error', 'maintenance'],
      diagnostic_status: ['pending', 'in_progress', 'completed', 'failed'],
      message_role: ['user', 'assistant', 'system', 'error'],
      remediation_status: [
        'pending',
        'approved',
        'rejected',
        'executed',
        'failed',
      ],
      user_role: ['owner', 'admin', 'viewer'],
    },
  },
} as const;
