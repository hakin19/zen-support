import { config } from 'dotenv';
import path from 'path';
import { vi } from 'vitest';

// Load test environment variables from project root
config({ path: path.resolve(__dirname, '../../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DEVICE_ID = 'TEST-DEVICE-001';
process.env.API_GATEWAY_URL = 'http://localhost:3000';

// Mock network utilities
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));
