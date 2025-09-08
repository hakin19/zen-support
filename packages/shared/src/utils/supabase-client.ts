import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.generated';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;
let supabaseConfig: SupabaseConfig | null = null;

/**
 * Initialize the Supabase client with configuration
 * This should be called once at application startup
 */
export function initializeSupabase(config: SupabaseConfig): void {
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase URL and anon key are required');
  }

  // Store config for later use
  supabaseConfig = config;

  // Initialize regular client with anon key
  supabaseClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });

  // Initialize admin client with service role key if provided
  if (config.serviceRoleKey) {
    supabaseAdminClient = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
    });
  }
}

/**
 * Get the regular Supabase client (uses anon key)
 * Used for operations that respect Row Level Security
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(
      'Supabase client not initialized. Call initializeSupabase first.'
    );
  }
  return supabaseClient;
}

/**
 * Get the admin Supabase client (uses service role key)
 * Bypasses Row Level Security - use with caution
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClient) {
    throw new Error(
      'Supabase admin client not initialized. Provide serviceRoleKey to initializeSupabase.'
    );
  }
  return supabaseAdminClient;
}

/**
 * Create an authenticated Supabase client with a JWT token
 * This client respects Row Level Security policies based on the user's auth state
 */

export function getAuthenticatedSupabaseClient(
  accessToken: string
): SupabaseClient<Database, 'public', Database['public']> {
  if (!supabaseConfig) {
    throw new Error(
      'Supabase client not initialized. Call initializeSupabase first.'
    );
  }

  // Create a new client with the provided access token
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  }) as SupabaseClient<any, 'public', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Test the Supabase connection
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('devices').select('id').limit(1);
    return !error;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
}
