import { config } from 'dotenv';
import path from 'path';
import { vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Load test environment variables
config({ path: path.resolve(process.cwd(), '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Supabase test client configuration
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Create test Supabase clients
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Global test setup
beforeAll(async () => {
  // Ensure Supabase is running
  try {
    const { error } = await supabase
      .from('_test_connection')
      .select('*')
      .limit(1);
    // This will fail but that's expected - we just want to check connection
  } catch (e) {
    // Connection test - errors are expected
  }
});

afterAll(async () => {
  // Clean up any test data if needed
});

// Mock console methods to reduce noise in tests
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

// Restore console methods for debugging if needed
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  // Keep debug for test debugging
  debug: originalConsole.log,
};

// Add custom matchers if needed
// expect.extend({
//   toBeValidEmail(received) {
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     const pass = emailRegex.test(received);
//     return {
//       pass,
//       message: () =>
//         pass
//           ? `expected ${received} not to be a valid email`
//           : `expected ${received} to be a valid email`,
//     };
//   },
// });

// Global test utilities
export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const clearAllMocks = () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
};

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  clearAllMocks();
});

afterEach(async () => {
  // Clean up after each test
  clearAllMocks();

  // Clean up test data if in isolated mode
  const isIsolatedTest = process.env.TEST_ISOLATION === 'true';
  if (isIsolatedTest) {
    // Clean up any test data created during this test
    // This is optional and can be enabled per test
    await cleanupTestData();
  }
});

// Global cleanup function for test isolation
async function cleanupTestData() {
  try {
    // Clean recent test data (created in last 5 minutes)
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const tables = ['devices', 'users', 'customers'];
    for (const table of tables) {
      await supabaseAdmin.from(table).delete().gte('created_at', cutoffTime);
    }
  } catch (error) {
    // Ignore cleanup errors in tests
    console.debug('Test cleanup warning:', error);
  }
}

// Note: Do NOT globally mock Supabase or Redis here.
// Integration tests rely on real clients; unit tests should mock per-file as needed.

// Export test utilities (only when using React components)
// export * from '@testing-library/react';
// export { default as userEvent } from '@testing-library/user-event';
