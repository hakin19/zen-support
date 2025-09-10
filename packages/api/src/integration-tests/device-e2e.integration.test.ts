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

const wait = promisify(setTimeout);

describe('Device E2E Integration Tests', () => {
  let server: FastifyInstance;
  let redis: Redis;
  let deviceAgent: DeviceAgent | null = null;
  let deviceWebSocket: WebSocket | null = null;
  const TEST_DEVICE_ID = 'test-device-integration';
  const TEST_DEVICE_SECRET = 'integration-test-secret';
  const TEST_CUSTOMER_ID = 'test-customer-123';
  let authToken: string | null = null;

  beforeAll(async () => {
    // Start the API server
    server = await createServer();
    await server.listen({ port: 3001, host: '127.0.0.1' });

    // Connect to Redis
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      retryStrategy: () => null,
    });

    // Clear any existing test data
    await cleanupTestData();

    // Seed test device in database
    await seedTestDevice();
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
    // Hash the device secret
    const hashedSecret = createHash('sha256')
      .update(TEST_DEVICE_SECRET)
      .digest('hex');

    // Insert test device into database
    const response = await fetch(
      `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:
            process.env.SUPABASE_ANON_KEY ||
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfa2V5IiwiZXhwIjoxOTgzODEyOTk2fQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          id: TEST_DEVICE_ID,
          customer_id: TEST_CUSTOMER_ID,
          name: 'Integration Test Device',
          device_secret_hash: hashedSecret,
          status: 'offline',
          last_heartbeat: new Date().toISOString(),
        }),
      }
    );

    if (!response.ok && response.status !== 409) {
      const error = await response.text();
      console.error('Failed to seed test device:', error);
    }
  }

  async function cleanupTestData() {
    // Delete test device from database
    const response = await fetch(
      `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.${TEST_DEVICE_ID}`,
      {
        method: 'DELETE',
        headers: {
          apikey:
            process.env.SUPABASE_ANON_KEY ||
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfa2V5IiwiZXhwIjoxOTgzODEyOTk2fQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      console.error('Failed to cleanup test device:', error);
    }
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
      const metrics = {
        cpu: 45.5,
        memory: 60.2,
        uptime: 3600,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(
        'http://127.0.0.1:3001/api/v1/device/heartbeat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authToken!,
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            metrics,
            status: 'online',
          }),
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.acknowledged).toBe(true);
      expect(data).toHaveProperty('nextHeartbeat');
      expect(data.nextHeartbeat).toBeGreaterThan(0);

      // Verify device status was updated in database
      const deviceResponse = await fetch(
        `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey:
              process.env.SUPABASE_ANON_KEY ||
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
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
            deviceId: TEST_DEVICE_ID,
            metrics: { cpu: 50, memory: 60, uptime: 1000 },
            status: 'online',
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
      expect(connectedMessage.deviceId).toBe(TEST_DEVICE_ID);
    });

    it('should handle WebSocket ping/pong', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>(resolve => {
        deviceWebSocket!.once('open', () => resolve());
      });

      // Wait for connected message
      await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => resolve());
      });

      // Send ping
      deviceWebSocket.send(JSON.stringify({ type: 'ping' }));

      // Wait for pong
      const pongMessage = await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(pongMessage.type).toBe('pong');
    });

    it('should receive and acknowledge commands', async () => {
      const wsUrl = `ws://127.0.0.1:3001/api/v1/device/ws`;

      deviceWebSocket = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Session': authToken!,
        },
      });

      await new Promise<void>(resolve => {
        deviceWebSocket!.once('open', () => resolve());
      });

      // Wait for connected message
      await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => resolve());
      });

      // Simulate command being sent to device (would normally come from portal)
      // For testing, we'll manually insert a command into Redis queue
      const command = {
        id: 'cmd-123',
        type: 'diagnostic',
        payload: { action: 'ping', target: '8.8.8.8' },
      };

      await redis.lpush(
        `device:${TEST_DEVICE_ID}:commands`,
        JSON.stringify(command)
      );

      // Trigger command check by sending heartbeat
      deviceWebSocket.send(
        JSON.stringify({
          type: 'heartbeat',
          metrics: { cpu: 30, memory: 40, uptime: 1000 },
        })
      );

      // Wait for command message
      const commandMessage = await new Promise<any>(resolve => {
        deviceWebSocket!.on('message', data => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'command') {
            resolve(msg);
          }
        });
      });

      expect(commandMessage.type).toBe('command');
      expect(commandMessage.command.id).toBe('cmd-123');

      // Send command result
      deviceWebSocket.send(
        JSON.stringify({
          type: 'command_result',
          commandId: 'cmd-123',
          status: 'completed',
          result: { success: true, output: 'PING 8.8.8.8: 64 bytes' },
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

      await new Promise<void>(resolve => {
        deviceWebSocket!.once('open', () => resolve());
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

      // Wait for connected message
      const connectedMessage = await new Promise<any>(resolve => {
        deviceWebSocket!.once('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(connectedMessage.type).toBe('connected');
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
        `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey:
              process.env.SUPABASE_ANON_KEY ||
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
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
        `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey:
              process.env.SUPABASE_ANON_KEY ||
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
          },
        }
      );
      let devices = await deviceResponse.json();
      expect(devices[0].status).toBe('online');

      // Stop the agent (simulate going offline)
      await deviceAgent.stop();

      // Give time for status update
      await wait(500);

      // Verify device is offline
      deviceResponse = await fetch(
        `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.${TEST_DEVICE_ID}`,
        {
          headers: {
            apikey:
              process.env.SUPABASE_ANON_KEY ||
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
          },
        }
      );
      devices = await deviceResponse.json();
      expect(devices[0].status).toBe('offline');
    });
  });

  describe('End-to-End Device Command Flow', () => {
    it('should execute full command flow: queue -> WebSocket -> result', async () => {
      // Start device agent with command handler
      deviceAgent = new DeviceAgent({
        deviceId: TEST_DEVICE_ID,
        deviceSecret: TEST_DEVICE_SECRET,
        apiUrl: 'http://127.0.0.1:3001',
        customerId: TEST_CUSTOMER_ID,
        heartbeatInterval: 1000,
        logLevel: 'info',
        webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
      });

      // Add command handler
      deviceAgent.on('command', async (command: any) => {
        // Simulate command execution
        await wait(100);

        // Send result back
        deviceAgent.sendCommandResult({
          commandId: command.id,
          status: 'completed',
          result: {
            success: true,
            output: `Executed ${command.type} command successfully`,
          },
        });
      });

      await deviceAgent.start();

      // Wait for WebSocket connection
      await wait(500);

      // Queue a command for the device
      const command = {
        id: 'test-cmd-456',
        type: 'network-diagnostic',
        payload: {
          action: 'traceroute',
          target: 'google.com',
        },
        timestamp: new Date().toISOString(),
      };

      await redis.lpush(
        `device:${TEST_DEVICE_ID}:commands`,
        JSON.stringify(command)
      );

      // Wait for command to be processed
      await wait(2000);

      // Check if command result was stored
      const resultKey = `command:${command.id}:result`;
      const result = await redis.get(resultKey);

      expect(result).toBeTruthy();
      const resultData = JSON.parse(result!);
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
      authToken = authData.token;

      const startTime = Date.now();

      const response = await fetch(
        'http://127.0.0.1:3001/api/v1/device/heartbeat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Session': authToken,
          },
          body: JSON.stringify({
            deviceId: TEST_DEVICE_ID,
            metrics: { cpu: 30, memory: 40, uptime: 1000 },
            status: 'online',
          }),
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.ok).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent device connections', async () => {
      const deviceCount = 5;
      const agents: DeviceAgent[] = [];

      // Create and start multiple device agents
      const startPromises = [];
      for (let i = 0; i < deviceCount; i++) {
        const agent = new DeviceAgent({
          deviceId: `test-device-concurrent-${i}`,
          deviceSecret: TEST_DEVICE_SECRET,
          apiUrl: 'http://127.0.0.1:3001',
          customerId: TEST_CUSTOMER_ID,
          heartbeatInterval: 5000,
          logLevel: 'error',
          webSocketUrl: 'ws://127.0.0.1:3001/api/v1/device/ws',
        });

        agents.push(agent);

        // Seed device
        const hashedSecret = createHash('sha256')
          .update(TEST_DEVICE_SECRET)
          .digest('hex');

        await fetch(
          `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey:
                process.env.SUPABASE_ANON_KEY ||
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfa2V5IiwiZXhwIjoxOTgzODEyOTk2fQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'}`,
            },
            body: JSON.stringify({
              id: `test-device-concurrent-${i}`,
              customer_id: TEST_CUSTOMER_ID,
              name: `Concurrent Test Device ${i}`,
              device_secret_hash: hashedSecret,
              status: 'offline',
            }),
          }
        );

        startPromises.push(agent.start());
      }

      // Start all agents concurrently
      await Promise.all(startPromises);

      // Verify all agents are running
      for (const agent of agents) {
        expect(agent.getStatus()).toBe('running');
        expect(agent.isConnected()).toBe(true);
      }

      // Clean up
      const stopPromises = agents.map(agent => agent.stop());
      await Promise.all(stopPromises);

      // Clean up test devices
      for (let i = 0; i < deviceCount; i++) {
        await fetch(
          `${process.env.SUPABASE_URL || 'http://localhost:54321'}/rest/v1/devices?id=eq.test-device-concurrent-${i}`,
          {
            method: 'DELETE',
            headers: {
              apikey:
                process.env.SUPABASE_ANON_KEY ||
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfa2V5IiwiZXhwIjoxOTgzODEyOTk2fQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'}`,
            },
          }
        );
      }
    });
  });
});
