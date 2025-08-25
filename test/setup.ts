import { config } from 'dotenv';
import path from 'path';
import { vi, beforeEach, afterEach } from 'vitest';

// Load test environment variables
config({ path: path.resolve(process.cwd(), '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

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

afterEach(() => {
  // Clean up after each test
  clearAllMocks();
});

// Export test utilities
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
