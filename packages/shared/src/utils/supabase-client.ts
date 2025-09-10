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

  // Skip re-initialization if already initialized with same config
  if (supabaseClient && supabaseConfig?.url === config.url) {
    console.log('[SUPABASE INIT] Already initialized with same URL, skipping');
    return;
  }

  // Diagnostic logging to debug test issues
  console.log('[SUPABASE INIT] Initializing with URL:', config.url);

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
  // WORKAROUND: Always create a completely fresh client instance
  // This bypasses the corrupted singleton that was created when Edge Runtime was hanging
  const url = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client not initialized. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  console.log('[SUPABASE-FRESH] Creating new admin client');
  console.log('[SUPABASE-FRESH] URL:', url);
  console.log('[SUPABASE-FRESH] Key exists:', !!serviceKey);

  // Create a completely new client using the createClient imported at the top
  // Note: We're NOT using the cached singleton, we're creating a new one each time
  const newClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });

  console.log('[SUPABASE-FRESH] Client created:', !!newClient);
  console.log('[SUPABASE-FRESH] Has from method:', typeof newClient?.from);

  // Test the client to make sure it's working
  const testResult = newClient.from('devices');
  console.log('[SUPABASE-FRESH] Test from() call result:', typeof testResult);

  return newClient;
}

/**
 * Create an authenticated Supabase client with a JWT token
 * This client respects Row Level Security policies based on the user's auth state
 */

export function getAuthenticatedSupabaseClient(
  accessToken: string
): SupabaseClient<Database> {
  if (!supabaseConfig) {
    throw new Error(
      'Supabase client not initialized. Call initializeSupabase first.'
    );
  }

  // Create a new client with the provided access token
  return createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
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
  }) as SupabaseClient<Database>;
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
