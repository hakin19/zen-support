import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redisClient } from './redis-client';

// Mock the redis module
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('test-value'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(3600),
    hSet: vi.fn().mockResolvedValue(1),
    hGet: vi.fn().mockResolvedValue('hash-value'),
    hGetAll: vi.fn().mockResolvedValue({ field1: 'value1' }),
    hDel: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('RedisClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => {
      await redisClient.connect();
      expect(redisClient.client.connect).toHaveBeenCalled();
    });

    it('should disconnect from Redis successfully', async () => {
      await redisClient.disconnect();
      expect(redisClient.client.quit).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should create a session', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
      };

      const sessionId = await redisClient.createSession(sessionData, 3600);

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^sess_[a-f0-9]{32}$/);
      expect(redisClient.client.set).toHaveBeenCalled();
      expect(redisClient.client.expire).toHaveBeenCalled();
    });

    it('should get a session', async () => {
      const mockSession = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
      };

      vi.mocked(redisClient.client.get).mockResolvedValueOnce(
        JSON.stringify(mockSession)
      );

      const session = await redisClient.getSession('sess_test123');

      expect(session).toEqual(mockSession);
      expect(redisClient.client.get).toHaveBeenCalledWith(
        'session:sess_test123'
      );
    });

    it('should delete a session', async () => {
      const result = await redisClient.deleteSession('sess_test123');

      expect(result).toBe(true);
      expect(redisClient.client.del).toHaveBeenCalledWith(
        'session:sess_test123'
      );
    });

    it('should extend session TTL', async () => {
      const result = await redisClient.extendSession('sess_test123', 7200);

      expect(result).toBe(true);
      expect(redisClient.client.expire).toHaveBeenCalledWith(
        'session:sess_test123',
        7200
      );
    });
  });

  describe('Caching', () => {
    it('should set cache value', async () => {
      await redisClient.setCache('test-key', { data: 'test' }, 300);

      expect(redisClient.client.set).toHaveBeenCalledWith(
        'cache:test-key',
        JSON.stringify({ data: 'test' }),
        { EX: 300 }
      );
    });

    it('should get cache value', async () => {
      const mockData = { data: 'test' };
      vi.mocked(redisClient.client.get).mockResolvedValueOnce(
        JSON.stringify(mockData)
      );

      const result = await redisClient.getCache('test-key');

      expect(result).toEqual(mockData);
      expect(redisClient.client.get).toHaveBeenCalledWith('cache:test-key');
    });

    it('should delete cache value', async () => {
      const result = await redisClient.deleteCache('test-key');

      expect(result).toBe(true);
      expect(redisClient.client.del).toHaveBeenCalledWith('cache:test-key');
    });

    it('should return null for non-existent cache', async () => {
      vi.mocked(redisClient.client.get).mockResolvedValueOnce(null);

      const result = await redisClient.getCache('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('Pub/Sub', () => {
    it('should publish a message', async () => {
      const result = await redisClient.publish('test-channel', {
        event: 'test',
        data: 'message',
      });

      expect(result).toBe(1);
      expect(redisClient.client.publish).toHaveBeenCalledWith(
        'test-channel',
        JSON.stringify({ event: 'test', data: 'message' })
      );
    });

    it('should subscribe to a channel', async () => {
      const handler = vi.fn();
      await redisClient.subscribe('test-channel', handler);

      expect(redisClient.client.subscribe).toHaveBeenCalledWith('test-channel');
    });

    it('should unsubscribe from a channel', async () => {
      await redisClient.unsubscribe('test-channel');

      expect(redisClient.client.unsubscribe).toHaveBeenCalledWith(
        'test-channel'
      );
    });
  });
});
