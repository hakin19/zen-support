import { config } from 'dotenv';
import path from 'path';
import { vi } from 'vitest';

// Load test environment variables from project root
config({ path: path.resolve(__dirname, '../../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Supabase client utilities
vi.mock('@aizen/shared/utils/supabase-client', () => ({
  initializeSupabase: vi.fn(),
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}));

// Mock Redis client for unit tests
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  setex: vi.fn().mockResolvedValue('OK'),
  rpush: vi.fn().mockResolvedValue(1),
  lpop: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(0),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(0),
  ttl: vi.fn().mockResolvedValue(-1),
  publish: vi.fn().mockResolvedValue(0),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue('PONG'),
  flushAll: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),

  // Session management methods
  setSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(false),
  extendSession: vi.fn().mockResolvedValue(false),

  // Cache management methods
  setCache: vi.fn().mockResolvedValue(undefined),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn().mockResolvedValue(false),

  // Pub/Sub methods
  createSubscription: vi.fn().mockResolvedValue({
    channel: 'test',
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }),
  createMultiChannelSubscription: vi.fn().mockResolvedValue({
    channels: [],
    subscriber: {},
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribeAll: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }),

  // Utility methods
  getClient: vi.fn().mockReturnValue({}),
  duplicate: vi.fn().mockReturnValue(mockRedisClient),
  isReady: vi.fn().mockReturnValue(true),
};

vi.mock('@aizen/shared/utils/redis-client', () => ({
  RedisClient: vi.fn().mockImplementation(() => mockRedisClient),
  initializeRedis: vi.fn().mockReturnValue(mockRedisClient),
  getRedisClient: vi.fn().mockReturnValue(mockRedisClient),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));
