import { randomBytes } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

import type { RedisArgument } from '@redis/client/dist/lib/RESP/types';

export interface Session {
  token: string;
  expiresAt: Date;
}

interface StoredSession {
  deviceId: string;
  customerId: string;
  createdAt: string;
}

const SESSION_PREFIX = 'session:';
const DEFAULT_TTL = 604800; // 7 days in seconds

export const sessionService = {
  async createSession({
    deviceId,
    customerId,
    ttl = DEFAULT_TTL,
  }: {
    deviceId: string;
    customerId: string;
    ttl?: number;
  }): Promise<Session> {
    const redis = getRedisClient();
    // Generate a 64-char hex token (32 bytes)
    const token = randomBytes(32).toString('hex');
    const key = `${SESSION_PREFIX}${token}`;

    const sessionData: StoredSession = {
      deviceId,
      customerId,
      createdAt: new Date().toISOString(),
    };

    // Store session in Redis with TTL
    await redis.getClient().setEx(key, ttl, JSON.stringify(sessionData));

    return {
      token,
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  },

  async validateSession(token: string): Promise<{
    valid: boolean;
    deviceId?: string;
    customerId?: string;
  }> {
    const redis = getRedisClient();
    const key = `${SESSION_PREFIX}${token}`;

    const data = await redis.getClient().get(key);

    if (!data) {
      return { valid: false };
    }

    try {
      const session = JSON.parse(data) as StoredSession;
      return {
        valid: true,
        deviceId: session.deviceId,
        customerId: session.customerId,
      };
    } catch {
      return { valid: false };
    }
  },

  async refreshSession(token: string, ttl = DEFAULT_TTL): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${SESSION_PREFIX}${token}`;

    // Check if session exists
    const exists = await redis.getClient().exists(key);
    if (!exists) {
      return false;
    }

    // Refresh TTL
    const result = await redis.getClient().expire(key, ttl);
    return result === 1;
  },

  async revokeSession(token: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${SESSION_PREFIX}${token}`;

    const result = await redis.getClient().del(key);
    return result === 1;
  },

  async revokeDeviceAllSessions(deviceId: string): Promise<number> {
    const redis = getRedisClient();
    const client = redis.getClient();
    let revokedCount = 0;

    // Use SCAN instead of KEYS to avoid blocking Redis
    // Use string-based cursor as required by node-redis v4+
    let cursor = '0';
    const match = `${SESSION_PREFIX}*`;

    do {
      // SCAN returns {cursor: string, keys: string[]}
      const result = await client.scan(cursor as unknown as RedisArgument, {
        MATCH: match,
        COUNT: 100, // Process 100 keys at a time
      });

      cursor = result.cursor;
      const keys = result.keys;

      if (keys.length > 0) {
        // Batch fetch session data
        const values = await client.mGet(keys);

        // Process each session and collect keys to delete
        const keysToDelete: string[] = [];
        for (let i = 0; i < keys.length; i++) {
          const value = values[i];
          const key = keys[i];
          if (value && typeof value === 'string' && key) {
            try {
              const session = JSON.parse(value) as StoredSession;
              if (session.deviceId === deviceId) {
                keysToDelete.push(key);
              }
            } catch {
              // Skip invalid session data
            }
          }
        }

        // Batch delete matching sessions
        if (keysToDelete.length > 0) {
          await client.del(keysToDelete);
          revokedCount += keysToDelete.length;
        }
      }
    } while (cursor !== '0');

    return revokedCount;
  },
};
