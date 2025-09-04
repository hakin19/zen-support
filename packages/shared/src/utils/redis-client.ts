import { createClient } from 'redis';

import type { RedisClientType } from 'redis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryStrategy?: (times: number) => number | false;
}

export interface SubscriptionHandle {
  channel: string;
  unsubscribe: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export class RedisClient {
  private client: RedisClientType;
  private config: RedisConfig;
  private isConnected: boolean = false;

  constructor(config: RedisConfig) {
    this.config = {
      ...config,
      host: config.host ?? 'localhost',
      port: config.port ?? 6379,
    };

    this.client = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port,
        reconnectStrategy:
          this.config.retryStrategy ??
          ((times): number | false => {
            if (times > 10) {
              console.error('Redis: Max reconnection attempts reached');
              return false;
            }
            return Math.min(times * 100, 3000);
          }),
      },
      password: this.config.password,
      database: this.config.db,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('Redis: Connecting...');
    });

    this.client.on('ready', () => {
      console.log('Redis: Connected and ready');
      this.isConnected = true;
    });

    this.client.on('error', err => {
      console.error('Redis error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('Redis: Connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis: Reconnecting...');
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.quit();
    } catch (error) {
      console.error('Failed to disconnect from Redis:', error);
      throw error;
    }
  }

  // Session management methods
  async setSession(
    sessionId: string,
    data: unknown,
    ttl?: number
  ): Promise<void> {
    const key = `session:${sessionId}`;
    const value = JSON.stringify(data);

    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      // Default TTL of 24 hours
      await this.client.setEx(key, 86400, value);
    }
  }

  async getSession(sessionId: string): Promise<unknown> {
    const key = `session:${sessionId}`;
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Failed to parse session data:', error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const key = `session:${sessionId}`;
    const result = await this.client.del(key);
    return result === 1;
  }

  async extendSession(sessionId: string, ttl: number): Promise<boolean> {
    const key = `session:${sessionId}`;
    const result = await this.client.expire(key, ttl);
    return result === 1;
  }

  // Cache management methods
  async setCache(key: string, value: unknown, ttl?: number): Promise<void> {
    const cacheKey = `cache:${key}`;
    const data = JSON.stringify(value);

    if (ttl) {
      await this.client.setEx(cacheKey, ttl, data);
    } else {
      await this.client.set(cacheKey, data);
    }
  }

  async getCache(key: string): Promise<unknown> {
    const cacheKey = `cache:${key}`;
    const value = await this.client.get(cacheKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Failed to parse cache data:', error);
      return null;
    }
  }

  async deleteCache(key: string): Promise<boolean> {
    const cacheKey = `cache:${key}`;
    const result = await this.client.del(cacheKey);
    return result === 1;
  }

  // Pub/Sub methods for real-time updates
  async publish(channel: string, message: unknown): Promise<number> {
    const data = JSON.stringify(message);
    return await this.client.publish(channel, data);
  }

  /**
   * Creates a subscription to a Redis channel.
   * Returns a SubscriptionHandle that must be used to properly clean up the subscription.
   *
   * @param channel - Channel to subscribe to
   * @param callback - Callback to handle messages
   * @returns SubscriptionHandle for managing the subscription lifecycle
   */
  async createSubscription(
    channel: string,
    callback: (message: unknown) => void
  ): Promise<SubscriptionHandle> {
    // Create a dedicated subscriber client for this subscription
    const subscriber = this.client.duplicate();
    await subscriber.connect();

    // Subscribe to the channel
    await subscriber.subscribe(channel, message => {
      try {
        const data = JSON.parse(message) as unknown;
        callback(data);
      } catch (error) {
        console.error('Failed to parse subscription message:', error);
      }
    });

    // Return handle for cleanup
    return {
      channel,
      unsubscribe: async (): Promise<void> => {
        try {
          await subscriber.unsubscribe(channel);
          await subscriber.disconnect();
        } catch (error) {
          console.error(
            `Failed to cleanup subscription for channel ${channel}:`,
            error
          );
        }
      },
      disconnect: async (): Promise<void> => {
        try {
          await subscriber.disconnect();
        } catch (error) {
          console.error(
            `Failed to disconnect subscriber for channel ${channel}:`,
            error
          );
        }
      },
    };
  }

  /**
   * @deprecated Use createSubscription() instead for proper lifecycle management.
   * This method should only be called on a duplicate client instance
   * that is dedicated to subscriptions.
   */
  async subscribe(
    channel: string,
    callback: (message: unknown) => void
  ): Promise<void> {
    await this.client.subscribe(channel, message => {
      try {
        const data = JSON.parse(message) as unknown;
        callback(data);
      } catch (error) {
        console.error('Failed to parse subscription message:', error);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.client.unsubscribe(channel);
  }

  // Direct Redis operations (for compatibility)
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string): Promise<string | null> {
    return await this.client.set(key, value);
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    return await this.client.setEx(key, ttl, value);
  }

  async rpush(key: string, value: string): Promise<number> {
    return await this.client.rPush(key, value);
  }

  async lpop(key: string): Promise<string | null> {
    return await this.client.lPop(key);
  }

  // Utility methods
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async flushAll(): Promise<void> {
    await this.client.flushAll();
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  getClient(): RedisClientType {
    return this.client;
  }

  duplicate(): RedisClient {
    const duplicateClient = this.client.duplicate();
    // Create a new RedisClient instance wrapping the duplicate
    const wrapper = Object.create(RedisClient.prototype) as RedisClient & {
      client: RedisClientType;
      config: RedisConfig;
      isConnected: boolean;
      setupEventHandlers: () => void;
    };
    wrapper.client = duplicateClient;
    wrapper.config = this.config;
    wrapper.isConnected = false;
    wrapper.setupEventHandlers = this.setupEventHandlers.bind(wrapper);
    (wrapper.setupEventHandlers as () => void)();
    return wrapper;
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance for the application
let redisClient: RedisClient | null = null;

export function initializeRedis(config: RedisConfig): RedisClient {
  redisClient = redisClient ?? new RedisClient(config);
  return redisClient;
}

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    throw new Error(
      'Redis client not initialized. Call initializeRedis first.'
    );
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
  }
}
