import path from 'path';

import { config } from 'dotenv';
import { beforeAll, afterAll } from 'vitest';

// Load test environment variables
config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

// Set test environment
process.env.NODE_ENV = 'test';

// Integration tests need real Supabase and Redis clients, not mocks
// This setup file specifically avoids mocking external services

// Global test setup for integration tests
beforeAll(async () => {
  console.log('[INTEGRATION TEST SETUP] Starting integration test environment');
  console.log(
    '[INTEGRATION TEST SETUP] Using Supabase URL:',
    process.env.SUPABASE_URL
  );
  console.log('[INTEGRATION TEST SETUP] Redis host:', process.env.REDIS_HOST);
});

afterAll(async () => {
  console.log(
    '[INTEGRATION TEST SETUP] Cleaning up integration test environment'
  );
});

// Utility for integration tests
export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));
