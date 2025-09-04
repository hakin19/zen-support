import type {
  RedisClient,
  SubscriptionHandle,
  MultiChannelSubscriptionHandle,
} from '@aizen/shared/utils/redis-client';
import type { RedisClientType } from 'redis';

/**
 * Type-safe wrapper for Redis pub/sub operations.
 * Ensures consistent JSON serialization/deserialization across the codebase.
 *
 * Redis pub/sub only transmits strings, so we must serialize objects to JSON
 * before publishing and deserialize after receiving.
 */

/**
 * Publishes a message to a Redis channel with automatic JSON serialization
 * @param redis - Redis client instance (either raw or wrapper)
 * @param channel - Channel name to publish to
 * @param data - Data to publish (will be JSON stringified)
 */
export async function publishToChannel<T = unknown>(
  redis: RedisClientType | RedisClient,
  channel: string,
  data: T
): Promise<void> {
  // Always serialize to JSON string for consistency
  const serialized = JSON.stringify(data);
  // Check if it's our wrapper class
  if ('getClient' in redis) {
    await redis.publish(channel, data); // Wrapper handles serialization
  } else {
    await redis.publish(channel, serialized);
  }
}

/**
 * Subscribes to a Redis channel with automatic JSON deserialization.
 * For RedisClient instances, returns a SubscriptionHandle for proper cleanup.
 * For raw RedisClientType, the caller is responsible for lifecycle management.
 *
 * @param redis - Redis client instance (should be a duplicate for pub/sub)
 * @param channel - Channel name to subscribe to
 * @param handler - Callback to handle deserialized messages
 * @returns SubscriptionHandle if using RedisClient wrapper, void otherwise
 */
export async function subscribeToChannel<T = unknown>(
  redis: RedisClientType | RedisClient,
  channel: string,
  handler: (data: T, rawMessage: string) => void | Promise<void>
): Promise<SubscriptionHandle | void> {
  // Check if it's our wrapper class
  if ('createSubscription' in redis) {
    // Use the new createSubscription method that returns a handle
    return await redis.createSubscription(channel, (data: unknown) => {
      void handler(data as T, JSON.stringify(data));
    });
  } else {
    // For raw Redis client, caller manages the lifecycle
    await redis.subscribe(channel, async (rawMessage: string) => {
      try {
        // Always deserialize from JSON string
        const data = JSON.parse(rawMessage) as T;
        await handler(data, rawMessage);
      } catch (error) {
        // Log parse errors but don't crash the subscriber
        console.error(
          `Failed to parse message from channel ${channel}:`,
          error
        );
        console.error('Raw message:', rawMessage);
      }
    });
  }
}

/**
 * Stores data in a Redis list with automatic JSON serialization
 * @param redis - Redis client instance
 * @param key - Redis key for the list
 * @param data - Data to store (will be JSON stringified)
 */
export async function pushToRedisList<T = unknown>(
  redis: RedisClientType | RedisClient,
  key: string,
  data: T
): Promise<void> {
  const serialized = JSON.stringify(data);
  const client = 'getClient' in redis ? redis.getClient() : redis;
  await client.rPush(key, serialized);
}

/**
 * Retrieves and parses data from Redis with automatic JSON deserialization
 * @param redis - Redis client instance
 * @param key - Redis key to retrieve
 * @returns Parsed data or null if key doesn't exist
 */
export async function getFromRedis<T = unknown>(
  redis: RedisClientType | RedisClient,
  key: string
): Promise<T | null> {
  const client = 'getClient' in redis ? redis.getClient() : redis;
  const rawData = await client.get(key);
  if (!rawData) return null;

  try {
    return JSON.parse(rawData) as T;
  } catch (error) {
    console.error(`Failed to parse data from key ${key}:`, error);
    return null;
  }
}

/**
 * Sets data in Redis with automatic JSON serialization and optional TTL
 * @param redis - Redis client instance
 * @param key - Redis key to set
 * @param data - Data to store (will be JSON stringified)
 * @param ttlSeconds - Optional TTL in seconds
 */
export async function setInRedis<T = unknown>(
  redis: RedisClientType | RedisClient,
  key: string,
  data: T,
  ttlSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(data);
  const client = 'getClient' in redis ? redis.getClient() : redis;

  if (ttlSeconds) {
    await client.setEx(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

/**
 * Create a multi-channel subscription handler for efficiently subscribing
 * to multiple channels with a single Redis connection.
 * This is recommended when you need to subscribe to many channels
 * from the same logical client (e.g., a WebSocket connection).
 *
 * @param redis - Redis client instance (wrapper only, as raw client doesn't support this)
 * @returns MultiChannelSubscriptionHandle for managing multiple subscriptions
 */
export async function createMultiChannelSubscription(
  redis: RedisClient
): Promise<MultiChannelSubscriptionHandle> {
  return await redis.createMultiChannelSubscription();
}

/**
 * Subscribe to multiple channels using a single Redis connection.
 * More efficient than multiple individual subscriptions.
 *
 * @param redis - Redis client instance (wrapper only)
 * @param channels - Array of channel configurations
 * @returns MultiChannelSubscriptionHandle for cleanup
 */
export async function subscribeToMultipleChannels<T = unknown>(
  redis: RedisClient,
  channels: Array<{
    channel: string;
    handler: (data: T, rawMessage: string) => void | Promise<void>;
  }>
): Promise<MultiChannelSubscriptionHandle> {
  const multiSub = await redis.createMultiChannelSubscription();

  // Subscribe to all channels
  for (const { channel, handler } of channels) {
    await multiSub.subscribe(channel, (data: unknown) => {
      void handler(data as T, JSON.stringify(data));
    });
  }

  return multiSub;
}

// Type definitions for common message structures
export interface DeviceStatusMessage {
  type: 'status_update' | 'command_completed';
  status?: Record<string, unknown>;
  commandId?: string;
  result?: Record<string, unknown>;
  requestId?: string;
  timestamp: string;
}

export interface DeviceControlMessage {
  type: 'session_approved' | 'new_command';
  sessionId?: string;
  commandId?: string;
  requestId?: string;
  timestamp: string;
}

export interface CommandData {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  customerId: string;
  requestId: string;
}
