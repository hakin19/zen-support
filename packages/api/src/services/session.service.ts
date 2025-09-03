import { randomUUID } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

export interface SessionData {
  deviceId: string;
  customerId: string;
  valid: boolean;
}

export interface CreateSessionResult {
  token: string;
  expiresAt: Date;
}

interface StoredSession {
  deviceId: string;
  customerId: string;
  createdAt: string;
}

const SESSION_PREFIX = 'device:session:';
const DEFAULT_TTL = 604800; // 7 days in seconds

export const sessionService = {
  async createSession(params: {
    deviceId: string;
    customerId: string;
    ttl?: number;
  }): Promise<CreateSessionResult> {
    const token = randomUUID();
    const ttl = params.ttl ?? DEFAULT_TTL;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const sessionData: StoredSession = {
      deviceId: params.deviceId,
      customerId: params.customerId,
      createdAt: new Date().toISOString(),
    };

    try {
      const redis = getRedisClient();
      await redis.setSession(`${SESSION_PREFIX}${token}`, sessionData, ttl);

      return {
        token,
        expiresAt,
      };
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error('Failed to create session');
    }
  },

  async validateSession(token: string): Promise<SessionData> {
    try {
      const redis = getRedisClient();
      const sessionData = await redis.getSession(`${SESSION_PREFIX}${token}`);

      if (!sessionData) {
        return {
          valid: false,
          deviceId: '',
          customerId: '',
        };
      }

      const session = sessionData as StoredSession;
      return {
        valid: true,
        deviceId: session.deviceId,
        customerId: session.customerId,
      };
    } catch (error) {
      console.error('Failed to validate session:', error);
      return {
        valid: false,
        deviceId: '',
        customerId: '',
      };
    }
  },

  async refreshSession(token: string, ttl?: number): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const sessionTTL = ttl ?? DEFAULT_TTL;
      return await redis.extendSession(`${SESSION_PREFIX}${token}`, sessionTTL);
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return false;
    }
  },

  async deleteSession(token: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      return await redis.deleteSession(`${SESSION_PREFIX}${token}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  },
};
