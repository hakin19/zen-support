// CRITICAL: Load test environment variables BEFORE any other imports
// This ensures all imported modules see the correct configuration
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force load .env.test with override to ensure test environment variables take precedence
dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});

// Log to verify environment is loaded correctly
console.log('[TEST ENV] Loaded environment from .env.test');
console.log('[TEST ENV] SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('[TEST ENV] REDIS_HOST:', process.env.REDIS_HOST || 'localhost');

// Now import everything else AFTER environment is configured
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import { DeviceAgent } from '@aizen/device-agent';
import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initializeSupabase } from '@aizen/shared/utils/supabase-client';
import { initializeRedis } from '@aizen/shared/utils/redis-client';

const wait = promisify(setTimeout);

describe('Device E2E Integration Tests', () => {
  let server: FastifyInstance;
  let redis: Redis;
  let deviceAgent: DeviceAgent | null = null;
  let deviceWebSocket: WebSocket | null = null;
  const TEST_DEVICE_ID = 'test-device-integration';
  const TEST_DEVICE_SECRET = 'integration-test-secret';
  const TEST_CUSTOMER_ID = '00000000-0000-0000-0000-000000000001'; // Valid UUID
  let authToken: string | null = null;

  beforeAll(async () => {
    console.log('🚀 Starting beforeAll hook...');

    // Ensure required environment variables are set
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        'Missing required Supabase environment variables. Please ensure .env.test is properly configured.'
      );
    }

    console.log('📦 Environment variables loaded');

    // Initialize Supabase client globally for the API server
    initializeSupabase({
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log('🔧 Initialized Supabase for API server');

    // Initialize Redis client globally for the API server
    const globalRedis = initializeRedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '1'),
    });
    // Connect the Redis client
    await globalRedis.connect();
    console.log('🔧 Initialized and connected Redis for API server');

    // Connect to Redis for test operations (separate instance)
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379, // Use the actual running Redis port
      db: parseInt(process.env.REDIS_DB || '1'),
      retryStrategy: () => null,
    });

    // Ensure Redis is connected
    await redis.ping();
    console.log('🔗 Redis test client connected');

    // Clear any existing test data before seeding
    await cleanupTestData().catch(err => {
      console.log('⚠️  Initial cleanup (expected to fail):', err.message);
    });

    // Seed test data
    console.log('🌱 About to seed test data...');
    await seedTestDevice();
    console.log('✅ Test data seeded');

    // Start the API server after data is seeded
    console.log('🚀 Starting API server...');
    server = await createServer();
    await server.listen({ port: 3001, host: '127.0.0.1' });

    // Test that the server is actually running
    const healthCheck = await fetch('http://127.0.0.1:3001/healthz');
    if (!healthCheck.ok) {
      throw new Error('Server health check failed');
    }
    console.log('✅ Server health check passed');

    // Test authentication to debug
    console.log('🔐 Testing authentication...');
    const testAuthResponse = await fetch(
      'http://127.0.0.1:3001/api/v1/device/auth',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: TEST_DEVICE_ID,
          deviceSecret: TEST_DEVICE_SECRET,
        }),
      }
    );

    if (testAuthResponse.ok) {
      console.log('✅ Test authentication successful');
    } else {
      const errorBody = await testAuthResponse.text();
      console.error(
        '❌ Test authentication failed:',
        testAuthResponse.status,
        errorBody
      );
    }

    console.log('✅ Test environment ready');
  });

  afterAll(async () => {
    // Clean up WebSocket
    if (deviceWebSocket?.readyState === WebSocket.OPEN) {
      deviceWebSocket.close();
    }

    // Stop device agent
    if (deviceAgent?.getStatus() === 'running') {
      await deviceAgent.stop();
    }

    // Clean up test data
    await cleanupTestData();

    // Close connections
    await redis.quit();
    await server.close();
  });

  beforeEach(async () => {
    // Reset state before each test
    if (deviceWebSocket?.readyState === WebSocket.OPEN) {
      deviceWebSocket.close();
      deviceWebSocket = null;
    }
    if (deviceAgent?.getStatus() === 'running') {
      await deviceAgent.stop();
    }
    deviceAgent = null;
    authToken = null;

    // Clear Redis sessions
    const keys = await redis.keys('session:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  async function seedTestDevice() {
    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Write to stderr so it shows up in test output
    console.error('🔧 Starting seedTestDevice...');
    console.error('  SUPABASE_URL:', supabaseUrl);
    console.error('  Has SERVICE_KEY:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test'
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Test the connection first
    console.log('📡 Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('customers')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('❌ Supabase connection test failed:', testError);
      throw new Error(`Supabase connection failed: ${testError.message}`);
    }
    console.log('✅ Supabase connection successful');

    // 1. Seed customer data using upsert to prevent conflicts on re-runs
    console.log('📝 Seeding customer:', TEST_CUSTOMER_ID);
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .upsert(
        {
          id: TEST_CUSTOMER_ID,
          name: 'Integration Test Customer',
          email: 'integration-test@example.com',
          phone: '555-0100',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select();

    if (customerError) {
      console.error('❌ Error seeding customer:', customerError);
      throw new Error(`Failed to seed test customer: ${customerError.message}`);
    }
    console.log('✅ Customer seeded:', customerData);

    // 2. Seed device data, linking it to the customer
    console.log('📝 Seeding device:', TEST_DEVICE_ID);
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .upsert(
        {
          device_id: TEST_DEVICE_ID,
          customer_id: TEST_CUSTOMER_ID,
          name: 'Integration Test Device',
          type: 'raspberry_pi',
          status: 'offline',
          last_heartbeat_at: new Date().toISOString(),
          registered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_id' }
      )
      .select();

    if (deviceError) {
      console.error('❌ Error seeding device:', deviceError);
      throw new Error(`Failed to seed test device: ${deviceError.message}`);
    }
    console.log('✅ Device seeded:', deviceData);

    // 3. Store the hashed device secret in Redis
    console.log('🔐 Storing device secret in Redis...');
    const secretHash = createHash('sha256')
      .update(TEST_DEVICE_SECRET)
      .digest('hex');
    const redisKey = `device:secret:sha256:${TEST_DEVICE_ID}`;

    await redis.set(redisKey, secretHash);

    // Verify it was stored
    const storedHash = await redis.get(redisKey);
    console.log('✅ Secret stored in Redis:', !!storedHash);

    // Verify data was actually created
    const { data: verifyDevice, error: verifyError } = await supabase
      .from('devices')
      .select('*')
      .eq('device_id', TEST_DEVICE_ID)
      .single();

    if (verifyError || !verifyDevice) {
      console.error('❌ Verification failed - device not found:', verifyError);
      throw new Error('Device was not created in database');
    }

    console.log('✅ Device verified in database:', verifyDevice);

    // Write to diagnostic file for debugging
    const diagInfo = {
      timestamp: new Date().toISOString(),
      action: 'seed_verification',
      device: verifyDevice,
      redisKey: redisKey,
      redisHasSecret: !!storedHash,
    };
    fs.appendFileSync(
      '/tmp/test-diag.log',
      `[SEED] ${JSON.stringify(diagInfo)}\n`
    );

    // Also verify the customer exists
    const { data: verifyCustomer, error: customerVerifyError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', TEST_CUSTOMER_ID)
      .single();

    if (customerVerifyError || !verifyCustomer) {
      console.error('❌ Customer verification failed:', customerVerifyError);
      throw new Error('Customer was not created in database');
    }

    console.log('✅ Customer verified in database:', verifyCustomer);

    // List all devices to debug
    const { data: allDevices, error: listError } = await supabase
      .from('devices')
      .select('device_id, customer_id, name');

    console.log('📋 All devices in database:', allDevices);
    fs.appendFileSync(
      '/tmp/test-diag.log',
      `[SEED] All devices: ${JSON.stringify(allDevices)}\n`
    );

    console.log('✅ Test data seeded and verified successfully');
  }

  async function cleanupTestData() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Cannot cleanup: missing Supabase credentials');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 1. Clean up Redis data
    try {
      // Clean up device secret
      const redisKey = `device:secret:sha256:${TEST_DEVICE_ID}`;
      await redis.del(redisKey);

      // Clean up all session keys
      const sessionKeys = await redis.keys('session:*');
      if (sessionKeys.length > 0) {
        await redis.del(...sessionKeys);
      }
    } catch (error) {
      console.warn('Redis cleanup error:', error);
    }

    // 2. Delete device first due to foreign key constraint
    const { error: deviceError } = await supabase
      .from('devices')
      .delete()
      .eq('device_id', TEST_DEVICE_ID);

    if (deviceError && deviceError.code !== 'PGRST116') {
      // PGRST116 = not found, which is fine
      console.warn('Device cleanup error:', deviceError.message);
    }

    // 3. Delete customer
    const { error: customerError } = await supabase
      .from('customers')
      .delete()
      .eq('id', TEST_CUSTOMER_ID);

    if (customerError && customerError.code !== 'PGRST116') {
      console.warn('Customer cleanup error:', customerError.message);
    }

    console.log('Test data cleaned up');
  }

  describe('Device Authentication Flow', () => {
    it('should authenticate device and receive session token', async () => {
      const response = await fetch('http://127.0.0.1:3001/api/v1/device/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: TEST_DEVICE_ID,
          deviceSecret: TEST_DEVICE_SECRET,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Authentication failed:', response.status, errorText);
      }
      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('expiresIn');
      expect(data.token).toMatch(/^[a-f0-9]{64}$/); // Session token format

      // Verify session exists in Redis
      const session = await redis.get(`session:${data.token}`);
      expect(session).toBeTruthy();
      const sessionData = JSON.parse(session!);
      expect(sessionData.deviceId).toBe(TEST_DEVICE_ID);

      authToken = data.token;
    });

    it('should reject invalid device credentials', async () => {
      const response = await fetch('http://127.0.0.1:3001/api/v1/device/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: TEST_DEVICE_ID,
          deviceSecret: 'wrong-secret',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('Device Heartbeat System', () => {
    beforeEach(async () => {
      // Authenticate first to get token
      const authResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/auth',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            deviceSecret: TEST_DEVICE_SECRET,
          }),
        }
      );
      const authData = await authResponse.json();
      authToken = authData.token;
    });

    it('should send heartbeat with metrics and update device status', async () => {
      const response = await fetch(
        'http://127.0.0.1:3001/api/v1/device/heartbeat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authToken!,
          },
          body: JSON.stringify({
            status: 'online',
            metrics: {
              cpu: 45.2,
              memory: 62.8,
              uptime: 3600,
            },
          }),
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);

      // Verify device status was updated in database
      const deviceResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
          },
        }
      );
      const devices = await deviceResponse.json();
      expect(devices[0].status).toBe('online');
    });

    it('should reject heartbeat without valid session', async () => {
      const response = await fetch(
        'http://127.0.0.1:3001/api/v1/device/heartbeat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': 'invalid-token',
          },
          body: JSON.stringify({
            status: 'online',
            metrics: {
              cpu: 45.2,
              memory: 62.8,
              uptime: 3600,
            },
          }),
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('WebSocket Communication', () => {
    beforeEach(async () => {
      // Authenticate first to get token
      const authResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/auth',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            deviceSecret: TEST_DEVICE_SECRET,
          }),
        }
      );
      const authData = await authResponse.json();
      authToken = authData.token;
    });

    it('should establish WebSocket connection with authentication', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>((resolve, reject) => {
        deviceWebSocket!.once('open', () => resolve());
        deviceWebSocket!.once('error', error => reject(error));
      });

      expect(deviceWebSocket.readyState).toBe(WebSocket.OPEN);

      // Wait for connected message
      const connectedMessage = await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(connectedMessage.type).toBe('connected');
    });

    it('should handle WebSocket ping/pong', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>((resolve, reject) => {
        deviceWebSocket!.once('open', () => resolve());
        deviceWebSocket!.once('error', error => reject(error));
      });

      // Send ping
      deviceWebSocket.ping();

      // Wait for pong
      const pongReceived = await new Promise<boolean>(resolve => {
        deviceWebSocket!.once('pong', () => resolve(true));
        setTimeout(() => resolve(false), 1000);
      });

      expect(pongReceived).toBe(true);
    });

    it('should receive and acknowledge commands', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>((resolve, reject) => {
        deviceWebSocket!.once('open', () => resolve());
        deviceWebSocket!.once('error', error => reject(error));
      });

      // Wait for connected message first
      await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      // Queue a command for the device
      const commandResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/commands',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authToken!,
          },
          body: JSON.stringify({
            command: 'ping',
            parameters: { target: '8.8.8.8' },
          }),
        }
      );

      expect(commandResponse.ok).toBe(true);

      // Device should receive the command
      const commandMessage = await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => {
          const message = JSON.parse(data.toString());
          if (message.type === 'command') {
            resolve(message);
          }
        });
      });

      expect(commandMessage.type).toBe('command');
      expect(commandMessage.command).toBe('ping');

      // Send acknowledgment
      deviceWebSocket.send(
        JSON.stringify({
          type: 'command_ack',
          commandId: commandMessage.id,
        })
      );
    });

    it('should handle WebSocket reconnection', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      // First connection
      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>((resolve, reject) => {
        deviceWebSocket!.once('open', () => resolve());
        deviceWebSocket!.once('error', error => reject(error));
      });

      // Close connection
      deviceWebSocket.close();

      await wait(100);

      // Reconnect
      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>((resolve, reject) => {
        deviceWebSocket!.once('open', () => resolve());
        deviceWebSocket!.once('error', error => reject(error));
      });

      expect(deviceWebSocket.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('Device Agent Integration', () => {
    it('should complete full device lifecycle: auth -> heartbeat -> WebSocket', async () => {
      // Create and start device agent
      deviceAgent = new DeviceAgent({
        deviceId: TEST_DEVICE_ID,
        deviceSecret: TEST_DEVICE_SECRET,
        apiUrl: 'http://127.0.0.1:3001',
        customerId: TEST_CUSTOMER_ID,
        heartbeatInterval: 5000,
        logLevel: 'info',
        webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
      });

      // Start the agent
      await deviceAgent.start();

      expect(deviceAgent.getStatus()).toBe('running');
      expect(deviceAgent.isRegistered()).toBe(true);
      expect(deviceAgent.isConnected()).toBe(true);

      // Wait for first heartbeat
      await wait(1000);

      // Verify device is online in database
      const deviceResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
          },
        }
      );
      const devices = await deviceResponse.json();
      expect(devices[0].status).toBe('online');

      // Verify health status
      const health = deviceAgent.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.websocket).toBe('connected');

      // Stop the agent
      await deviceAgent.stop();
      expect(deviceAgent.getStatus()).toBe('stopped');
    });

    it('should handle device offline/online transitions', async () => {
      // Start device agent
      deviceAgent = new DeviceAgent({
        deviceId: TEST_DEVICE_ID,
        deviceSecret: TEST_DEVICE_SECRET,
        apiUrl: 'http://127.0.0.1:3001',
        customerId: TEST_CUSTOMER_ID,
        heartbeatInterval: 1000,
        logLevel: 'info',
        webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
      });

      await deviceAgent.start();

      // Wait for device to be online
      await wait(500);

      // Verify device is online
      let deviceResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
          },
        }
      );
      let devices = await deviceResponse.json();
      expect(devices[0].status).toBe('online');

      // Stop the agent (simulate going offline)
      await deviceAgent.stop();

      // Wait for status to update
      await wait(1000);

      // Verify device went offline
      deviceResponse = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
          },
        }
      );
      devices = await deviceResponse.json();
      expect(devices[0].status).toBe('offline');
    });
  });

  describe('End-to-End Device Command Flow', () => {
    it('should execute full command flow: queue -> WebSocket -> result', async () => {
      // Start device agent
      deviceAgent = new DeviceAgent({
        deviceId: TEST_DEVICE_ID,
        deviceSecret: TEST_DEVICE_SECRET,
        apiUrl: 'http://127.0.0.1:3001',
        customerId: TEST_CUSTOMER_ID,
        logLevel: 'info',
        webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
      });

      await deviceAgent.start();

      // Set up command handler
      deviceAgent.on('command', async command => {
        // Simulate command execution
        await wait(100);
        return {
          success: true,
          output: `Executed ${command.command}`,
        };
      });

      // Queue a command via API
      const authResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/auth',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            deviceSecret: TEST_DEVICE_SECRET,
          }),
        }
      );
      const authData = await authResponse.json();

      const commandResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/commands',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authData.token,
          },
          body: JSON.stringify({
            command: 'test-command',
            parameters: { foo: 'bar' },
          }),
        }
      );

      expect(commandResponse.ok).toBe(true);
      const commandData = await commandResponse.json();

      // Wait for command to be processed
      await wait(500);

      // Check command result
      const resultResponse = await fetch(
        `http://127.0.0.1:3001/api/v1/device/commands/${commandData.id}`,
        {
          headers: {
            'X-Device-Session': authData.token,
          },
        }
      );

      expect(resultResponse.ok).toBe(true);
      const resultData = await resultResponse.json();
      expect(resultData.status).toBe('completed');
      expect(resultData.result.success).toBe(true);

      await deviceAgent.stop();
    });
  });

  describe('Performance Requirements', () => {
    it('should complete heartbeat within 1 second', async () => {
      const authResponse = await fetch(
        'http://127.0.0.1:3001/api/v1/device/auth',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            deviceSecret: TEST_DEVICE_SECRET,
          }),
        }
      );
      const authData = await authResponse.json();

      const startTime = Date.now();
      const response = await fetch(
        'http://127.0.0.1:3001/api/v1/device/heartbeat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authData.token,
          },
          body: JSON.stringify({
            status: 'online',
            metrics: {
              cpu: 45.2,
              memory: 62.8,
              uptime: 3600,
            },
          }),
        }
      );
      const endTime = Date.now();

      expect(response.ok).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle concurrent device connections', async () => {
      const agents: DeviceAgent[] = [];
      const startPromises: Promise<void>[] = [];

      // Create multiple device agents
      for (let i = 0; i < 5; i++) {
        // First, seed the concurrent test devices
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          }
        );

        await supabase.from('devices').upsert(
          {
            device_id: `test-device-concurrent-${i}`,
            customer_id: TEST_CUSTOMER_ID,
            name: `Concurrent Test Device ${i}`,
            type: 'raspberry_pi',
            status: 'offline',
          },
          { onConflict: 'device_id' }
        );

        // Store secret in Redis
        const hashedSecret = createHash('sha256')
          .update(TEST_DEVICE_SECRET)
          .digest('hex');
        await redis.set(
          `device:secret:sha256:test-device-concurrent-${i}`,
          hashedSecret
        );

        const agent = new DeviceAgent({
          deviceId: `test-device-concurrent-${i}`,
          deviceSecret: TEST_DEVICE_SECRET,
          apiUrl: 'http://127.0.0.1:3001',
          customerId: TEST_CUSTOMER_ID,
          logLevel: 'error',
          webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
        });

        agents.push(agent);
        startPromises.push(agent.start());
      }

      // Start all agents concurrently
      await Promise.all(startPromises);

      // Verify all agents are running
      for (const agent of agents) {
        expect(agent.getStatus()).toBe('running');
        expect(agent.isRegistered()).toBe(true);
      }

      // Wait for devices to be online
      await wait(1000);

      // Verify all devices are online in database
      for (let i = 0; i < 5; i++) {
        const deviceResponse = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.test-device-concurrent-${i}`,
          {
            headers: {
              apikey: process.env.SUPABASE_ANON_KEY!,
            },
          }
        );
        const devices = await deviceResponse.json();
        expect(devices[0].status).toBe('online');
      }

      // Stop all agents
      await Promise.all(agents.map(agent => agent.stop()));

      // Cleanup concurrent test devices
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

      for (let i = 0; i < 5; i++) {
        await supabase
          .from('devices')
          .delete()
          .eq('device_id', `test-device-concurrent-${i}`);
        await redis.del(`device:secret:sha256:test-device-concurrent-${i}`);
      }
    });
  });
});
