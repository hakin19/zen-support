import { randomUUID } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

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
    const token = randomUUID();
    const key = `${SESSION_PREFIX}${token}`;

    const sessionData: StoredSession = {
      deviceId,
      customerId,
      createdAt: new Date().toISOString(),
    };

    // Store session in Redis with TTL
    await redis.setex(key, ttl, JSON.stringify(sessionData));

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

    const data = await redis.get(key);

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
    const exists = await redis.exists(key);
    if (!exists) {
      return false;
    }

    // Refresh TTL
    const result = await redis.expire(key, ttl);
    return result === 1;
  },

  async revokeSession(token: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${SESSION_PREFIX}${token}`;

    const result = await redis.del(key);
    return result === 1;
  },

  async revokeDeviceAllSessions(deviceId: string): Promise<number> {
    const redis = getRedisClient();

    // This would need to scan all sessions and delete matching ones
    // In production, we might maintain a secondary index for this
    const keys = await redis.keys(`${SESSION_PREFIX}*`);
    let revokedCount = 0;

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const session = JSON.parse(data) as StoredSession;
          if (session.deviceId === deviceId) {
            await redis.del(key);
            revokedCount++;
          }
        } catch {
          // Skip invalid session data
        }
      }
    }

    return revokedCount;
  },
};
