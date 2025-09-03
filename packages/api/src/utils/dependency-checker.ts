import { Redis } from 'ioredis';

import { config } from '../config';

export interface DependencyStatus {
  healthy: boolean;
  message: string;
}

export interface DependenciesResult {
  healthy: boolean;
  dependencies: {
    supabase: DependencyStatus;
    redis: DependencyStatus;
  };
}

async function checkSupabase(): Promise<DependencyStatus> {
  try {
    if (!config.supabase?.url || !config.supabase?.anonKey) {
      // In development without Supabase configured, consider it "healthy" to not block
      if (process.env.NODE_ENV === 'development') {
        return {
          healthy: true,
          message: 'Supabase not configured (development)',
        };
      }
      return {
        healthy: false,
        message: 'Supabase configuration missing',
      };
    }

    // Use a lightweight HTTP reachability check instead of a query
    // This checks if the Supabase REST API is reachable
    // AbortController is available globally in Node.js 16+
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${config.supabase.url}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: config.supabase.anonKey,
          Authorization: `Bearer ${config.supabase.anonKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 200, 401, 404, or any response means Supabase is reachable
      // We don't care about auth or specific tables, just connectivity
      if (response.status >= 200 && response.status < 600) {
        return {
          healthy: true,
          message: 'Connected',
        };
      }

      return {
        healthy: false,
        message: `Supabase returned unexpected status: ${response.status}`,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Check if it was a timeout
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          healthy: false,
          message: 'Supabase connection timeout (5s)',
        };
      }

      throw fetchError;
    }
  } catch (error) {
    return {
      healthy: false,
      message: `Supabase check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function checkRedis(): Promise<DependencyStatus> {
  // TODO: Consider using a shared Redis client if health check frequency increases
  // Current approach is fine for low-frequency checks (every 30-60s from ECS)
  try {
    if (!config.redis?.host || !config.redis?.port) {
      return {
        healthy: false,
        message: 'Redis configuration missing',
      };
    }

    const redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });

    await redis.connect();
    const result = await redis.ping();
    await redis.quit();

    if (result !== 'PONG') {
      return {
        healthy: false,
        message: 'Redis ping failed',
      };
    }

    return {
      healthy: true,
      message: 'Connected',
    };
  } catch (error) {
    return {
      healthy: false,
      message: `Redis check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function checkDependencies(): Promise<DependenciesResult> {
  const [supabase, redis] = await Promise.all([checkSupabase(), checkRedis()]);

  return {
    healthy: supabase.healthy && redis.healthy,
    dependencies: {
      supabase,
      redis,
    },
  };
}
