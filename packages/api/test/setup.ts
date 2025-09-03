import { config } from 'dotenv';
import path from 'path';
import { vi } from 'vitest';

// Load test environment variables from project root
config({ path: path.resolve(__dirname, '../../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Supabase client for unit tests
vi.mock('@aizen/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
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
  },
}));

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
vi.mock('@aizen/shared/utils/redis-client', () => ({
  redisClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
  },
  initializeRedis: vi.fn(),
  getRedisClient: vi.fn(() => ({
    setCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
    close: vi.fn(),
  })),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));
