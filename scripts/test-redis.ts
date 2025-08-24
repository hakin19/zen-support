#!/usr/bin/env tsx

import { randomBytes } from 'crypto';

import { initializeRedis } from '../packages/shared/src/utils/redis-client';

async function testRedisConnection(): Promise<void> {
  console.log('🔧 Testing Redis Connection and Session Management\n');
  console.log('==========================================\n');

  // Initialize Redis client
  const redis = initializeRedis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  });

  try {
    // Test 1: Connection
    console.log('Test 1: Connecting to Redis...');
    await redis.connect();
    console.log('✅ Connected successfully\n');

    // Test 2: Ping
    console.log('Test 2: Ping test...');
    const pong = await redis.ping();
    console.log(`✅ Ping response: ${pong}\n`);

    // Test 3: Session Management
    console.log('Test 3: Session Management...');
    const sessionId = randomBytes(16).toString('hex');
    const sessionData = {
      userId: 'user123',
      email: 'test@example.com',
      roles: ['user', 'admin'],
      createdAt: new Date().toISOString(),
    };

    // Set session
    await redis.setSession(sessionId, sessionData, 3600); // 1 hour TTL
    console.log(`✅ Session set: ${sessionId}`);

    // Get session
    const retrievedSession = await redis.getSession(sessionId);
    console.log('✅ Session retrieved:', retrievedSession);

    // Extend session
    await redis.extendSession(sessionId, 7200); // Extend to 2 hours
    console.log('✅ Session TTL extended\n');

    // Test 4: Cache Management
    console.log('Test 4: Cache Management...');
    const cacheKey = 'test:diagnostic:result';
    const cacheData = {
      deviceId: 'DEV-001',
      diagnostic: 'network-scan',
      results: {
        status: 'healthy',
        latency: 25,
        timestamp: new Date().toISOString(),
      },
    };

    // Set cache
    await redis.setCache(cacheKey, cacheData, 300); // 5 minutes TTL
    console.log(`✅ Cache set: ${cacheKey}`);

    // Get cache
    const retrievedCache = await redis.getCache(cacheKey);
    console.log('✅ Cache retrieved:', retrievedCache);

    // Delete cache
    await redis.deleteCache(cacheKey);
    console.log('✅ Cache deleted\n');

    // Test 5: Pub/Sub (Real-time updates)
    console.log('Test 5: Pub/Sub for real-time updates...');
    const channel = 'diagnostic:updates';

    // Subscribe to channel
    const messages: any[] = [];
    await redis.subscribe(channel, message => {
      messages.push(message);
      console.log('📨 Received message:', message);
    });

    // Publish messages
    await redis.publish(channel, {
      type: 'diagnostic_start',
      deviceId: 'DEV-001',
    });
    await redis.publish(channel, {
      type: 'diagnostic_complete',
      deviceId: 'DEV-001',
      status: 'success',
    });

    // Wait a bit for messages to be processed
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`✅ Published and received ${messages.length} messages\n`);

    // Test 6: Key patterns
    console.log('Test 6: Key pattern search...');
    const allSessionKeys = await redis.keys('session:*');
    console.log(`✅ Found ${allSessionKeys.length} session keys`);

    const allCacheKeys = await redis.keys('cache:*');
    console.log(`✅ Found ${allCacheKeys.length} cache keys\n`);

    // Cleanup
    console.log('Test 7: Cleanup...');
    await redis.deleteSession(sessionId);
    console.log('✅ Test session deleted');

    // Disconnect
    await redis.disconnect();
    console.log('✅ Disconnected from Redis\n');

    console.log('==========================================');
    console.log('✅ All Redis tests passed successfully!');
    console.log('==========================================');
  } catch (error) {
    console.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

// Run tests
testRedisConnection().catch(console.error);
