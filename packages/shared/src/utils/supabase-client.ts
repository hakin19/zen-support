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
    return;
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

  // Initialize admin client if service role key is provided
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
  // TODO(Edge Runtime): If this admin client is ever used from an Edge
  // environment (e.g., Vercel Edge Runtime, Cloudflare Workers), consider
  // returning a fresh client per call instead of the cached singleton to
  // avoid potential runtime hangs/corruption observed in some Edge runtimes.
  // Suggested pattern:
  //   const isEdge =
  //     typeof (globalThis as any).EdgeRuntime !== 'undefined' ||
  //     typeof (globalThis as any).WebSocketPair !== 'undefined';
  //   if (isEdge) {
  //     return createClient(url, serviceKey, {
  //       auth: { persistSession: false, autoRefreshToken: false },
  //     });
  //   }
  //   // Node.js: use the cached singleton (current behavior)
  //   if (supabaseAdminClient) return supabaseAdminClient;
  //   supabaseAdminClient = createClient(url, serviceKey, { ... });
  //   return supabaseAdminClient;
  //
  // Note: As of now, this admin client is only used in the Node.js Fastify API
  // path, not in Next.js middleware (which uses @supabase/ssr), so the
  // singleton behavior is appropriate.
  // First check if we have an initialized singleton
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  // Fall back to environment variables if not initialized via initializeSupabase
  const url = process.env.SUPABASE_URL ?? supabaseConfig?.url;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    supabaseConfig?.serviceRoleKey;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client not initialized. Provide serviceRoleKey to initializeSupabase or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  // Create and cache the admin client
  supabaseAdminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });

  return supabaseAdminClient;
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
