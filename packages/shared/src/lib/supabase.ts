/**
 * Supabase Client Utilities
 * Singleton pattern for consistent database access across the application
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/supabase.types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization of clients
let _supabase: SupabaseClient<Database> | null = null;
let _supabaseAdmin: SupabaseClient<Database> | null = null;

/**
 * Get environment variables with proper error handling
 */
function getEnvVars(): {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
} {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY };
}

/**
 * Public Supabase client for browser/client-side operations
 * Uses anon key with RLS policies enforced
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnvVars();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY'
      );
    }

    _supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return _supabase;
}

/**
 * Service role client for server-side operations
 * Bypasses RLS - use with caution and only on backend
 */
export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  if (!_supabaseAdmin) {
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getEnvVars();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return null;
    }

    _supabaseAdmin = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _supabaseAdmin;
}

// Export as getter properties for backward compatibility
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver): unknown {
    const client = getSupabase();
    return Reflect.get(client, prop, receiver);
  },
});

// Type assertion to handle the proxy properly
const supabaseAdminProxy = {} as SupabaseClient<Database>;
export const supabaseAdmin = new Proxy(supabaseAdminProxy, {
  get(_target, prop, receiver): unknown {
    const client = getSupabaseAdmin();
    if (!client) return null;
    return Reflect.get(client, prop, receiver);
  },
});

/**
 * Helper function to create a Supabase client with a custom access token
 * Useful for server-side operations with user context
 */
export function createSupabaseClient(
  accessToken?: string
): SupabaseClient<Database> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnvVars();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY'
    );
  }

  if (accessToken) {
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return getSupabase();
}

/**
 * Authentication helpers
 */
export const auth = {
  /**
   * Sign in with email OTP
   */
  async signInWithOTP(
    email: string
  ): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // Don't auto-create users
      },
    });
    return { data, error };
  },

  /**
   * Verify OTP code
   */
  async verifyOTP(
    email: string,
    token: string
  ): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { data, error };
  },

  /**
   * Sign out current user
   */
  async signOut(): Promise<{ error: unknown }> {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  /**
   * Get current session
   */
  async getSession(): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.auth.getSession();
    return { data, error };
  },

  /**
   * Get current user
   */
  async getUser(): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.auth.getUser();
    return { data, error };
  },

  /**
   * Refresh session
   */
  async refreshSession(): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.auth.refreshSession();
    return { data, error };
  },
};

/**
 * Database query helpers with proper typing
 */
export const db = {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get customers() {
    return getSupabase().from('customers');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get users() {
    return getSupabase().from('users');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get devices() {
    return getSupabase().from('devices');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get diagnosticSessions() {
    return getSupabase().from('diagnostic_sessions');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get remediationActions() {
    return getSupabase().from('remediation_actions');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get auditLogs() {
    return getSupabase().from('audit_logs');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get networkDiagnostics() {
    return getSupabase().from('network_diagnostics');
  },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
  get alerts() {
    return getSupabase().from('alerts');
  },
};

/**
 * Real-time subscription helpers
 */
export const realtime = {
  /**
   * Subscribe to device status changes
   */
  subscribeToDeviceStatus(
    customerId: string,
    callback: (payload: unknown) => void
  ): ReturnType<typeof supabase.channel> {
    return supabase
      .channel(`devices:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: `customer_id=eq.${customerId}`,
        },
        callback
      )
      .subscribe();
  },

  /**
   * Subscribe to diagnostic session updates
   */
  subscribeToSessions(
    customerId: string,
    callback: (payload: unknown) => void
  ): ReturnType<typeof supabase.channel> {
    return supabase
      .channel(`sessions:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diagnostic_sessions',
          filter: `customer_id=eq.${customerId}`,
        },
        callback
      )
      .subscribe();
  },

  /**
   * Subscribe to alerts
   */
  subscribeToAlerts(
    customerId: string,
    callback: (payload: unknown) => void
  ): ReturnType<typeof supabase.channel> {
    return supabase
      .channel(`alerts:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `customer_id=eq.${customerId}`,
        },
        callback
      )
      .subscribe();
  },

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(
    channel: ReturnType<typeof supabase.channel>
  ): Promise<'ok' | 'timed out' | 'error'> {
    return supabase.removeChannel(channel);
  },
};

/**
 * Storage helpers (if we use Supabase Storage later)
 */
export const storage = {
  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    bucket: string,
    path: string,
    file: ArrayBuffer | ArrayBufferView | Buffer
  ): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    return { data, error };
  },

  /**
   * Get public URL for a file
   */
  getPublicUrl(bucket: string, path: string): string {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Delete a file
   */
  async deleteFile(
    bucket: string,
    paths: string[]
  ): Promise<{ data: unknown; error: unknown }> {
    const { data, error } = await supabase.storage.from(bucket).remove(paths);
    return { data, error };
  },
};
