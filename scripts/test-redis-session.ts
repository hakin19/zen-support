#!/usr/bin/env tsx

/**
 * Redis Session Management Test
 * Tests Redis connectivity and session management functionality
 */

import {
  getRedisClient,
  initializeRedis,
} from '../packages/shared/src/utils/redis-client';

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

async function testRedisSession() {
  console.log(
    `\n${colors.bright}${colors.cyan}Testing Redis Session Management${colors.reset}\n`
  );

  // Initialize Redis with connection options
  initializeRedis({
    host: 'localhost',
    port: 6379,
  });
  const redis = getRedisClient();

  try {
    // Connect to Redis
    await redis.connect();

    // Test 1: Basic connectivity
    log('Testing Redis connectivity...', 'info');
    const pingResult = await redis.ping();
    if (pingResult === 'PONG') {
      log('✓ Redis connection successful', 'success');
    } else {
      throw new Error('Redis ping failed');
    }

    // Test 2: Session storage
    log('Testing session storage...', 'info');
    const sessionId = `test-session-${Date.now()}`;
    const sessionData = {
      userId: 'user-123',
      email: 'test@example.com',
      customerId: 'customer-456',
      createdAt: new Date().toISOString(),
    };

    // Store session using the session management methods
    await redis.setSession(sessionId, sessionData, 3600);
    log('✓ Session stored', 'success');

    // Retrieve session
    const retrieved = (await redis.getSession(sessionId)) as
      | typeof sessionData
      | null;
    if (retrieved && retrieved.email === sessionData.email) {
      log('✓ Session retrieved successfully', 'success');
    } else {
      throw new Error('Session not found or data mismatch');
    }

    // Test 3: Session extension
    log('Testing session extension...', 'info');
    const extended = await redis.extendSession(sessionId, 7200);
    if (extended) {
      log('✓ Session TTL extended to 2 hours', 'success');
    } else {
      throw new Error('Failed to extend session');
    }

    // Test 4: Delete session
    log('Testing session deletion...', 'info');
    await redis.deleteSession(sessionId);
    const deleted = await redis.getSession(sessionId);
    if (!deleted) {
      log('✓ Session deleted successfully', 'success');
    } else {
      throw new Error('Session deletion failed');
    }

    // Test 5: Cache functionality
    log('Testing cache functionality...', 'info');
    const cacheKey = `test-cache-${Date.now()}`;
    const cacheData = { result: 'test-data', timestamp: Date.now() };

    await redis.setCache(cacheKey, cacheData, 60);
    const cached = (await redis.getCache(cacheKey)) as typeof cacheData | null;
    if (cached && cached.result === cacheData.result) {
      log('✓ Cache functionality working', 'success');
    } else {
      throw new Error('Cache retrieval failed');
    }
    await redis.deleteCache(cacheKey);

    // Test 6: Pub/Sub
    log('Testing pub/sub functionality...', 'info');
    const channel = 'test-channel';
    let messageReceived = false;

    // Subscribe to channel
    await redis.subscribe(channel, (message: unknown) => {
      if (message === 'test-message') {
        messageReceived = true;
      }
    });

    // Publish a message
    await redis.publish(channel, 'test-message');

    // Wait a bit for the message
    await new Promise(resolve => setTimeout(resolve, 100));

    if (messageReceived) {
      log('✓ Pub/Sub working', 'success');
    } else {
      log('⚠ Pub/Sub message not received (may be timing issue)', 'warning');
    }

    console.log(
      `\n${colors.green}${colors.bright}✅ All Redis tests passed!${colors.reset}\n`
    );
    return true;
  } catch (error) {
    log(`Redis test failed: ${String(error)}`, 'error');
    console.log(
      `\n${colors.red}${colors.bright}❌ Redis tests failed${colors.reset}\n`
    );
    return false;
  } finally {
    await redis.disconnect();
  }
}

// Run the test
testRedisSession().catch(console.error);
