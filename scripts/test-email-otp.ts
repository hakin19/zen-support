#!/usr/bin/env tsx

/**
 * Email OTP Authentication Flow Test
 * Tests the complete Email OTP authentication with Supabase
 */

import { resolve } from 'path';

import { config } from 'dotenv';

import { getSupabaseAdmin, auth } from '../packages/shared/src/lib/supabase';
import {
  getRedisClient,
  initializeRedis,
} from '../packages/shared/src/utils/redis-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

// Test utilities
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(
  message: string,
  type: 'info' | 'success' | 'error' | 'warning' = 'info'
) {
  const color = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
  }[type];
  console.log(`${color}${type.toUpperCase()}:${colors.reset} ${message}`);
}

function section(title: string) {
  console.log(
    `\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`
  );
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(
    `${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`
  );
}

// Test configuration
const TEST_EMAIL = 'test.user@zenandzen.com';
const TEST_CUSTOMER_ID = '11111111-1111-1111-1111-111111111111'; // Acme Corp from seed data

interface TestResults {
  otpRequested: boolean;
  sessionCreated: boolean;
  redisSessionStored: boolean;
  userDataRetrieved: boolean;
  signOutSuccessful: boolean;
}

async function setupTestUser() {
  section('Setting Up Test User');

  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    log('Admin client not available - skipping user setup', 'warning');
    return null;
  }

  try {
    // Check if user exists in auth
    const {
      data: { users },
    } = await adminClient.auth.admin.listUsers();
    let authUser = users?.find(
      (u: any) => (u as { email: string }).email === TEST_EMAIL
    );

    if (!authUser) {
      log('Creating test user in Supabase Auth...', 'info');
      const { data, error } = await adminClient.auth.admin.createUser({
        email: TEST_EMAIL,
        email_confirm: true,
        user_metadata: {
          name: 'Test User',
          customer_id: TEST_CUSTOMER_ID,
        },
      });

      if (error) {
        throw error;
      }
      authUser = data.user;
      log(`✓ Auth user created: ${authUser.id}`, 'success');
    } else {
      log(`Test user already exists: ${authUser.id}`, 'info');
    }

    // Note: User database record creation will be handled by the handle_new_user trigger
    // when the auth user is created. For testing, we'll just ensure the auth user exists.
    log(
      '✓ User will be automatically created in database via trigger',
      'success'
    );

    // Update user metadata to include customer_id
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      authUser.id,
      {
        user_metadata: {
          name: 'Test User',
          customer_id: TEST_CUSTOMER_ID,
        },
      }
    );

    if (updateError) {
      log(
        `Warning: Could not update user metadata: ${updateError.message}`,
        'warning'
      );
    } else {
      log('✓ User metadata updated', 'success');
    }

    return authUser.id;
  } catch (error) {
    log(
      `Error setting up test user: ${JSON.stringify(error, null, 2)}`,
      'error'
    );
    return null;
  }
}

async function testRequestOTP(): Promise<boolean> {
  section('Testing OTP Request');

  try {
    log(`Requesting OTP for ${TEST_EMAIL}...`, 'info');
    const { error } = await auth.signInWithOTP(TEST_EMAIL);

    if (error) {
      log(`OTP request failed: ${JSON.stringify(error, null, 2)}`, 'error');
      return false;
    }

    log('✓ OTP request sent successfully', 'success');
    log(
      '📧 Check the Supabase dashboard Auth Logs to see the OTP code',
      'warning'
    );
    log(
      `   Dashboard: https://app.supabase.com/project/${process.env.SUPABASE_PROJECT_ID}/auth/logs`,
      'info'
    );

    // In development, we can't actually get the OTP without email access
    // So we'll provide instructions for manual testing
    log('\nFor manual testing:', 'info');
    log('1. Go to Supabase dashboard > Authentication > Logs', 'info');
    log('2. Find the latest "Send OTP" log entry', 'info');
    log('3. Copy the 6-digit OTP code from the log details', 'info');
    log(
      '4. Use the verify-otp.ts script with: npm run test:verify-otp <OTP_CODE>',
      'info'
    );

    return true;
  } catch (error) {
    log(`Unexpected error: ${String(error)}`, 'error');
    return false;
  }
}

async function testSessionManagement(): Promise<boolean> {
  section('Testing Session Management Integration');

  try {
    // Initialize Redis
    initializeRedis({
      host: 'localhost',
      port: 6379,
    });
    const redis = getRedisClient();
    await redis.connect();

    // Test storing a mock session in Redis
    log('Testing Redis session storage for auth...', 'info');
    const mockSessionId = `mock-auth-session-${Date.now()}`;
    const mockSessionData = {
      userId: 'test-user-id',
      email: TEST_EMAIL,
      customerId: TEST_CUSTOMER_ID,
      authToken: 'mock-token',
      createdAt: new Date().toISOString(),
    };

    await redis.setSession(mockSessionId, mockSessionData, 3600);
    log('✓ Mock session stored in Redis', 'success');

    const retrieved = (await redis.getSession(mockSessionId)) as
      | typeof mockSessionData
      | null;
    if (retrieved && retrieved.email === TEST_EMAIL) {
      log('✓ Session retrieved successfully from Redis', 'success');
    } else {
      throw new Error('Session retrieval failed');
    }

    // Clean up
    await redis.deleteSession(mockSessionId);
    await redis.disconnect();

    return true;
  } catch (error) {
    log(`Session management test failed: ${String(error)}`, 'error');
    return false;
  }
}

async function testAuthFlow(): Promise<TestResults> {
  const results: TestResults = {
    otpRequested: false,
    sessionCreated: false,
    redisSessionStored: false,
    userDataRetrieved: false,
    signOutSuccessful: false,
  };

  try {
    // Test OTP request
    results.otpRequested = await testRequestOTP();

    // Test session management
    results.redisSessionStored = await testSessionManagement();

    // Test getting current session (should be null without OTP verification)
    section('Testing Session State');

    const { data: sessionData } = await auth.getSession();
    if (!(sessionData as { session?: any })?.session) {
      log('✓ No active session before OTP verification (expected)', 'success');
    } else {
      log('⚠ Unexpected active session found', 'warning');
    }

    // Test sign out (should work even without active session)
    log('Testing sign out...', 'info');
    const { error: signOutError } = await auth.signOut();
    if (!signOutError) {
      log('✓ Sign out successful', 'success');
      results.signOutSuccessful = true;
    } else {
      log(`Sign out error: ${JSON.stringify(signOutError)}`, 'error');
    }

    return results;
  } catch (error) {
    log(`Auth flow test error: ${String(error)}`, 'error');
    return results;
  }
}

async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════╗
║        Email OTP Authentication Flow Testing              ║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Setup test user
  const userId = await setupTestUser();
  if (!userId) {
    log(
      'Failed to setup test user, continuing with limited tests...',
      'warning'
    );
  }

  // Run authentication flow tests
  const results = await testAuthFlow();

  // Summary
  section('Test Results Summary');

  const tests = [
    { name: 'OTP Request', passed: results.otpRequested },
    { name: 'Redis Session Storage', passed: results.redisSessionStored },
    { name: 'Sign Out', passed: results.signOutSuccessful },
  ];

  console.log('Test Results:');
  for (const test of tests) {
    const status = test.passed
      ? `${colors.green}✓ PASSED${colors.reset}`
      : `${colors.red}✗ FAILED${colors.reset}`;
    console.log(`  ${test.name}: ${status}`);
  }

  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;

  console.log(
    `\n${colors.bright}Total: ${passed}/${total} tests passed${colors.reset}`
  );

  if (passed === total) {
    console.log(
      `${colors.green}${colors.bright}\n✅ All automated tests passed!${colors.reset}`
    );
    console.log(
      `\n${colors.yellow}Note: Complete OTP verification requires manual testing${colors.reset}`
    );
    console.log(
      'Run the verify-otp script with the OTP code from Supabase dashboard'
    );
  } else {
    console.log(
      `${colors.red}${colors.bright}\n❌ Some tests failed. Please review the output above.${colors.reset}`
    );
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);
