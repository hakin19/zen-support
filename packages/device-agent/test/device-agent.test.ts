import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceAgent } from '../src/device-agent.js';
import type { DeviceConfig } from '../src/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DeviceAgent', () => {
  let agent: DeviceAgent | null = null;
  let config: DeviceConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Default successful fetch response for registration
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'jwt-token',
        expiresIn: 86400,
        heartbeatInterval: 30000,
      }),
    });

    config = {
      deviceId: 'test-device-001',
      deviceSecret: 'test-secret',
      apiUrl: 'https://api.test.com',
      customerId: 'customer-123',
      heartbeatInterval: 5000,
      logLevel: 'info',
    };
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (agent && agent.getStatus() === 'running') {
      try {
        await agent.stop();
      } catch {
        // Ignore errors during cleanup
      }
    }
    agent = null;
  });

  describe('initialization', () => {
    it('should create a new DeviceAgent instance with valid config', () => {
      agent = new DeviceAgent(config);
      expect(agent).toBeInstanceOf(DeviceAgent);
      expect(agent.getDeviceId()).toBe(config.deviceId);
      expect(agent.getStatus()).toBe('initialized');
    });

    it('should throw error when required config fields are missing', () => {
      const invalidConfig = { ...config, deviceId: '' };
      expect(() => new DeviceAgent(invalidConfig)).toThrow(
        'Device ID is required'
      );
    });

    it('should validate API URL format', () => {
      const invalidConfig = { ...config, apiUrl: 'not-a-url' };
      expect(() => new DeviceAgent(invalidConfig)).toThrow('Invalid API URL');
    });

    it('should set default heartbeat interval if not provided', () => {
      const configWithoutInterval = { ...config, heartbeatInterval: undefined };
      agent = new DeviceAgent(configWithoutInterval);
      expect(agent.getHeartbeatInterval()).toBe(60000); // Default 60 seconds
    });

    it('should validate heartbeat interval is positive', () => {
      const invalidConfig = { ...config, heartbeatInterval: -1000 };
      expect(() => new DeviceAgent(invalidConfig)).toThrow(
        'Heartbeat interval must be positive'
      );
    });
  });

  describe('lifecycle management', () => {
    it('should start and transition to running state', async () => {
      agent = new DeviceAgent(config);
      expect(agent.getStatus()).toBe('initialized');

      await agent.start();
      expect(agent.getStatus()).toBe('running');
      expect(agent.isConnected()).toBe(true);
    });

    it('should stop and transition to stopped state', async () => {
      agent = new DeviceAgent(config);
      await agent.start();
      expect(agent.getStatus()).toBe('running');

      agent.stop();
      expect(agent.getStatus()).toBe('stopped');
      expect(agent.isConnected()).toBe(false);
    });

    it('should handle graceful shutdown', async () => {
      agent = new DeviceAgent(config);
      await agent.start();

      agent.shutdown();
      expect(agent.getStatus()).toBe('stopped');
    });

    it('should not start if already running', async () => {
      agent = new DeviceAgent(config);
      await agent.start();

      await expect(agent.start()).rejects.toThrow('Agent is already running');
    });

    it('should not stop if not running', () => {
      agent = new DeviceAgent(config);

      expect(() => agent.stop()).toThrow('Agent is not running');
    });

    it('should handle start failures gracefully', async () => {
      agent = new DeviceAgent(config);

      // Mock all registration attempts to fail
      mockFetch.mockRejectedValue(new Error('Registration failed'));

      await expect(agent.start()).rejects.toThrow('Registration failed');
      expect(agent.getStatus()).toBe('error');
    });
  });

  describe('registration', () => {
    it('should register with API on start', async () => {
      agent = new DeviceAgent(config);

      await agent.start();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/device/auth',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(agent.isRegistered()).toBe(true);
    });

    it('should store authentication token after registration', async () => {
      agent = new DeviceAgent(config);
      const token = 'test-jwt-token';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token,
          expiresIn: 86400,
          heartbeatInterval: 30000,
        }),
      });

      await agent.start();

      expect(agent.getAuthToken()).toBe(token);
    });

    it('should handle registration failures', async () => {
      agent = new DeviceAgent(config);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(agent.start()).rejects.toThrow(
        'API call failed: 401 Unauthorized'
      );
      expect(agent.isRegistered()).toBe(false);
    });

    it('should retry registration on failure', async () => {
      agent = new DeviceAgent(config);

      let registrationCalls = 0;
      mockFetch.mockImplementation(url => {
        // Only count registration calls
        if (url.toString().includes('/device/auth')) {
          registrationCalls++;
          if (registrationCalls === 1) {
            return Promise.reject(new Error('Network error'));
          }
        }

        // Return success for all other calls (registration retry + heartbeat)
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 'jwt-token',
            expiresIn: 86400,
            deviceId: 'test-device-001',
            heartbeatInterval: 30000,
            acknowledged: true,
            commands: [],
            nextHeartbeat: 30000,
          }),
        });
      });

      await agent.start();

      expect(registrationCalls).toBe(2); // Failed once, then succeeded
      expect(agent.isRegistered()).toBe(true);
    });
  });

  describe('heartbeat mechanism', () => {
    it('should update heartbeat interval from server response', async () => {
      agent = new DeviceAgent(config);
      // Authentication response with heartbeat interval
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          expiresIn: 86400,
          deviceId: 'test-device-001',
        }),
      });

      // Heartbeat response with new interval
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 15000, // Server wants 15 second intervals
        }),
      });

      await agent.start();
      await agent['sendHeartbeat']();

      expect(agent.getHeartbeatInterval()).toBe(15000);
    });

    it('should re-authenticate on 401 error during heartbeat', async () => {
      agent = new DeviceAgent(config);

      // Initial successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'initial-token',
          expiresIn: 86400,
          deviceId: 'test-device-001',
        }),
      });

      await agent.start();
      expect(agent.isRegistered()).toBe(true);

      // First heartbeat succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 5000,
        }),
      });

      // Manually trigger heartbeat
      await agent['sendHeartbeat']();

      // Next heartbeat fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      // Re-authentication should succeed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'new-token',
          expiresIn: 86400,
          deviceId: 'test-device-001',
        }),
      });

      // Heartbeat after re-auth should succeed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 5000,
        }),
      });

      const authFailedHandler = vi.fn();
      agent.on('auth:failed', authFailedHandler);

      // Trigger heartbeat cycle that will fail with 401 and re-auth
      const heartbeatPromise = agent['startHeartbeat']();

      // Wait for the heartbeat cycle to process the 401 and re-auth
      await vi.advanceTimersByTimeAsync(100);

      // Verify no auth:failed event was emitted (successful re-auth)
      expect(authFailedHandler).not.toHaveBeenCalled();

      // Verify agent is still registered with new token
      expect(agent.isRegistered()).toBe(true);
      expect(agent.getAuthToken()).toBe('new-token');
    });

    it('should emit auth:failed event when re-authentication fails', async () => {
      agent = new DeviceAgent(config);

      // Initial successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'initial-token',
          expiresIn: 86400,
          deviceId: 'test-device-001',
        }),
      });

      await agent.start();

      // Heartbeat fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      // Re-authentication attempts all fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden - Invalid credentials',
      });

      const authFailedHandler = vi.fn();
      const heartbeatErrorHandler = vi.fn();
      agent.on('auth:failed', authFailedHandler);
      agent.on('heartbeat:error', heartbeatErrorHandler);

      // Trigger heartbeat cycle that will fail with 401 and fail re-auth
      const heartbeatPromise = agent['startHeartbeat']();

      // Wait for the heartbeat cycle to process the 401 and attempt re-auth
      // The re-auth attempts will take time due to retries (3 attempts with exponential backoff)
      await vi.advanceTimersByTimeAsync(10000);
      await vi.waitFor(() => {
        expect(authFailedHandler).toHaveBeenCalled();
      });
      await vi.waitFor(() => {
        expect(heartbeatErrorHandler).toHaveBeenCalled();
      });
    });

    it('should handle non-401 errors normally', async () => {
      agent = new DeviceAgent(config);

      // Initial successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'initial-token',
          expiresIn: 86400,
          deviceId: 'test-device-001',
        }),
      });

      await agent.start();
      const initialToken = agent.getAuthToken();

      // Heartbeat fails with 500 error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const heartbeatErrorHandler = vi.fn();
      const authFailedHandler = vi.fn();
      agent.on('heartbeat:error', heartbeatErrorHandler);
      agent.on('auth:failed', authFailedHandler);

      // Trigger heartbeat cycle that will fail with 500
      const heartbeatPromise = agent['startHeartbeat']();

      // Wait for the heartbeat cycle to process the error
      await vi.advanceTimersByTimeAsync(100);

      // Verify heartbeat error was emitted but no re-auth attempted
      expect(heartbeatErrorHandler).toHaveBeenCalled();
      expect(authFailedHandler).not.toHaveBeenCalled();

      // Token should remain unchanged (no re-auth attempted)
      expect(agent.getAuthToken()).toBe(initialToken);
    });
  });

  describe('error handling', () => {
    it('should emit error events', async () => {
      agent = new DeviceAgent(config);
      const errorHandler = vi.fn();
      agent.on('error', errorHandler);

      const error = new Error('Test error');
      agent.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should transition to error state on critical failures', async () => {
      agent = new DeviceAgent(config);

      // Mock all attempts to fail
      mockFetch.mockRejectedValue(new Error('Critical failure'));

      await expect(agent.start()).rejects.toThrow('Critical failure');
      expect(agent.getStatus()).toBe('error');
    });

    it('should attempt recovery from error state', async () => {
      agent = new DeviceAgent(config);

      // First start should fail: exhaust ApiClient's internal 3 retries
      // for each of the DeviceAgent's 2 registration attempts (total 6).
      for (let i = 0; i < 6; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Temporary failure'));
      }

      await expect(agent.start()).rejects.toThrow('Temporary failure');
      expect(agent.getStatus()).toBe('error');

      // Recovery succeeds
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          expiresIn: 86400,
          heartbeatInterval: 30000,
        }),
      });

      await agent.recover();
      expect(agent.getStatus()).toBe('running');
    });
  });

  describe('health check', () => {
    it('should report healthy status when running', async () => {
      agent = new DeviceAgent(config);

      await agent.start();

      const health = agent.getHealthStatus();
      expect(health.status).toBe('healthy');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.heartbeatCount).toBe(0);
    });

    it('should report unhealthy status when in error state', async () => {
      agent = new DeviceAgent(config);

      // Make registration fail
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      await expect(agent.start()).rejects.toThrow('Connection failed');

      const health = agent.getHealthStatus();
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Connection failed');
    });

    it('should track heartbeat statistics', async () => {
      agent = new DeviceAgent(config);

      await agent.start();

      const health = agent.getHealthStatus();
      expect(health.heartbeatCount).toBe(0);
      expect(health.heartbeatErrors).toBe(0);
    });

    it('should preserve specific error context in health status', async () => {
      agent = new DeviceAgent(config);

      // Make registration fail with a specific error
      mockFetch.mockRejectedValue(
        new Error('API call timed out after 30000ms: /api/v1/device/auth')
      );

      await expect(agent.start()).rejects.toThrow('API call timed out');

      const health = agent.getHealthStatus();
      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('API call timed out after 30000ms');
      expect(health.error).toContain('/api/v1/device/auth');
    });
  });
});
