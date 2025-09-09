#!/usr/bin/env node
/**
 * Test script to verify device authentication works correctly
 * Run with: npx tsx packages/api/src/scripts/test-device-auth.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Set SUPABASE_SERVICE_KEY from SUPABASE_SERVICE_ROLE_KEY if needed
if (
  !process.env.SUPABASE_SERVICE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Set to local Supabase for testing
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function testDeviceAuth(): Promise<void> {
  console.log('🔐 Testing device authentication...\n');

  // Import and initialize Supabase
  const { initializeSupabase } = await import(
    '@aizen/shared/utils/supabase-client'
  );

  initializeSupabase({
    url: process.env.SUPABASE_URL!,
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    serviceRoleKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  console.log('   ✓ Supabase client initialized');

  // Initialize Redis
  const { initializeRedis } = await import('@aizen/shared/utils/redis-client');
  initializeRedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  });

  console.log('   ✓ Redis client initialized\n');

  // Import after env vars are loaded
  const { deviceAuthService } = await import('../services/device-auth.service');

  const TEST_DEVICE_ID = 'test-device-001';
  const TEST_DEVICE_SECRET = 'test-secret-12345';
  const WRONG_SECRET = 'wrong-secret';

  // Test 1: Valid credentials
  console.log('Test 1: Valid credentials');
  const validResult = await deviceAuthService.validateCredentials(
    TEST_DEVICE_ID,
    TEST_DEVICE_SECRET
  );

  if (validResult.valid) {
    console.log('   ✅ Authentication successful');
    console.log('   Device:', validResult.device);
  } else {
    console.log('   ❌ Authentication failed (expected success)');
  }

  // Test 2: Invalid secret
  console.log('\nTest 2: Invalid secret');
  const invalidResult = await deviceAuthService.validateCredentials(
    TEST_DEVICE_ID,
    WRONG_SECRET
  );

  if (!invalidResult.valid) {
    console.log('   ✅ Authentication correctly rejected');
  } else {
    console.log('   ❌ Authentication succeeded (expected failure)');
  }

  // Test 3: Non-existent device
  console.log('\nTest 3: Non-existent device');
  const nonExistentResult = await deviceAuthService.validateCredentials(
    'non-existent-device',
    TEST_DEVICE_SECRET
  );

  if (!nonExistentResult.valid) {
    console.log(
      '   ✅ Authentication correctly rejected for non-existent device'
    );
  } else {
    console.log(
      '   ❌ Authentication succeeded for non-existent device (expected failure)'
    );
  }

  console.log('\n✨ All tests completed!');
}

// Run the test
testDeviceAuth()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
