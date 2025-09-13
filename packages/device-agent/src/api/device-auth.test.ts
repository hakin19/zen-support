import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './api-client.js';
import type { ApiClientConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Redis for session storage
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    get: vi.fn(),
    setEx: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  })),
}));

describe('Device Authentication and Heartbeat', () => {
  let apiClient: ApiClient | null = null;
  let config: ApiClientConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    config = {
      apiUrl: 'http://localhost:3001',
      deviceId: 'test-device-001',
      deviceSecret: 'test-secret-key',
      customerId: 'customer-123',
      heartbeatInterval: 30000, // 30 seconds as per spec
    };

    // Default successful authentication response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'session-token-abc123',
        expiresIn: 86400, // 24 hours
      }),
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (apiClient) {
      await apiClient.disconnect();
      apiClient = null;
    }
  });

  describe('Device Authentication - /api/v1/device/auth', () => {
    it('should authenticate with deviceId and deviceSecret', async () => {
      apiClient = new ApiClient(config);

      const result = await apiClient.authenticate();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/device/auth',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            deviceId: 'test-device-001',
            deviceSecret: 'test-secret-key',
          }),
        })
      );
    });

    it('should store session token on successful authentication', async () => {
      const sessionToken = 'session-token-xyz789';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: sessionToken,
          expiresIn: 86400,
        }),
      });

      apiClient = new ApiClient(config);
      await apiClient.authenticate();

      expect(apiClient.getAuthToken()).toBe(sessionToken);
      expect(apiClient.getConnectionState()).toBe('connected');
    });

    it('should handle authentication failure with 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid device credentials',
      });

      apiClient = new ApiClient(config);

      await expect(apiClient.authenticate()).resolves.toBe(false);
      expect(apiClient.getConnectionState()).toBe('disconnected');
      expect(apiClient.getAuthToken()).toBeNull();
    });

    it('should retry authentication with exponential backoff on network failure', async () => {
      let attemptCount = 0;
      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 'session-token-after-retry',
            expiresIn: 86400,
          }),
        });
      });

      apiClient = new ApiClient(config);

      const startTime = Date.now();
      await apiClient.authenticate();
      const endTime = Date.now();

      expect(attemptCount).toBe(3);
      expect(apiClient.getAuthToken()).toBe('session-token-after-retry');

      // Should have delays: 1000ms + 2000ms = 3000ms minimum
      // Allow some variance for test execution
      expect(endTime - startTime).toBeGreaterThanOrEqual(2900);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      apiClient = new ApiClient(config);

      await expect(apiClient.authenticate()).resolves.toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Default max retries
    });

    it('should include proper headers in authentication request', async () => {
      apiClient = new ApiClient(config);
      await apiClient.authenticate();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('DeviceAgent'),
          }),
        })
      );
    });
  });

  describe('Heartbeat System - /api/v1/device/heartbeat', () => {
    beforeEach(async () => {
      // Set up authenticated client
      apiClient = new ApiClient(config);
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should send heartbeat with metrics to correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      const response = await apiClient.sendHeartbeat();

      expect(response).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/device/heartbeat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Device-Session': 'session-token-abc123',
          }),
          body: expect.stringContaining('"status":"healthy"'),
        })
      );

      // Verify metrics are included
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.metrics).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.any(Number),
        uptime: expect.any(Number),
      });
    });

    it('should include session token in X-Device-Session header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Device-Session': 'session-token-abc123',
          }),
        })
      );
    });

    it('should update device status on successful heartbeat', async () => {
      const heartbeatHandler = vi.fn();
      apiClient.on('heartbeat:success', heartbeatHandler);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      expect(heartbeatHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged: true,
        })
      );
    });

    it('should handle heartbeat failure and emit error event', async () => {
      const errorHandler = vi.fn();
      apiClient.on('heartbeat:error', errorHandler);

      mockFetch.mockRejectedValue(new Error('Heartbeat failed'));

      const response = await apiClient.sendHeartbeat();

      expect(response).toBeNull();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Heartbeat failed'),
        })
      );
    });

    it('should respect heartbeat interval from server response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 60000, // Server wants 60 second intervals
        }),
      });

      await apiClient.sendHeartbeat();

      // Start automatic heartbeats
      await apiClient.startHeartbeat();

      // Fast-forward time
      vi.advanceTimersByTime(59000);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Initial heartbeat only

      vi.advanceTimersByTime(2000); // Total 61 seconds
      expect(mockFetch).toHaveBeenCalledTimes(2); // Should have sent second heartbeat
    });

    it('should process commands received in heartbeat response', async () => {
      const commandHandler = vi.fn();
      apiClient.on('command:received', commandHandler);

      const testCommand = {
        id: 'cmd-123',
        type: 'diagnostic',
        payload: { script: 'ping 8.8.8.8' },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [testCommand],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      expect(commandHandler).toHaveBeenCalledWith(testCommand);
    });

    it('should include CPU, memory, and uptime metrics', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metrics).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.any(Number),
        uptime: expect.any(Number),
      });

      // Validate metric ranges
      expect(body.metrics.cpu).toBeGreaterThanOrEqual(0);
      expect(body.metrics.cpu).toBeLessThanOrEqual(100);
      expect(body.metrics.memory).toBeGreaterThan(0);
      expect(body.metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle session expiry and re-authenticate', async () => {
      // First heartbeat fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Session expired',
      });

      // Re-authentication succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'new-session-token',
          expiresIn: 86400,
        }),
      });

      // Second heartbeat succeeds with new token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      // Should have called auth endpoint for re-authentication
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/device/auth',
        expect.any(Object)
      );

      // Should have retried heartbeat with new token
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/device/heartbeat',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Device-Session': 'new-session-token',
          }),
        })
      );
    });
  });

  describe('Heartbeat Interval and Timeout Handling', () => {
    beforeEach(async () => {
      apiClient = new ApiClient(config);
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should send heartbeats at configured intervals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.startHeartbeat();

      // Initial heartbeat
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance another 30 seconds
      vi.advanceTimersByTime(30000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should stop heartbeats when disconnected', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.startHeartbeat();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await apiClient.disconnect();

      // Advance time - no more heartbeats should be sent
      vi.advanceTimersByTime(60000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle heartbeat timeout and retry', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First heartbeat times out
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 1000);
          });
        }
        // Subsequent heartbeats succeed
        return Promise.resolve({
          ok: true,
          json: async () => ({
            acknowledged: true,
            commands: [],
            nextHeartbeat: 30000,
          }),
        });
      });

      const errorHandler = vi.fn();
      apiClient.on('heartbeat:error', errorHandler);

      await apiClient.startHeartbeat();

      // Wait for timeout
      vi.advanceTimersByTime(1500);

      // Error should be emitted
      await vi.waitFor(() => {
        expect(errorHandler).toHaveBeenCalled();
      });

      // Should retry after 5 seconds
      vi.advanceTimersByTime(5000);

      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Performance Requirements', () => {
    beforeEach(async () => {
      apiClient = new ApiClient(config);
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should complete heartbeat request within 1 second', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({
                acknowledged: true,
                commands: [],
                nextHeartbeat: 30000,
              }),
            });
          }, 500); // Simulate 500ms response time
        });
      });

      const startTime = performance.now();
      await apiClient.sendHeartbeat();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should timeout if heartbeat takes longer than 1 second', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Request timeout'));
          }, 1500);
        });
      });

      const errorHandler = vi.fn();
      apiClient.on('heartbeat:error', errorHandler);

      const startTime = performance.now();
      await apiClient.sendHeartbeat();
      const endTime = performance.now();

      // Should timeout around 1 second, not wait for full 1.5 seconds
      expect(endTime - startTime).toBeLessThan(1200);
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should store session in Redis-compatible format', async () => {
      const sessionToken = 'test-session-token';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: sessionToken,
          expiresIn: 86400,
        }),
      });

      apiClient = new ApiClient(config);
      await apiClient.authenticate();

      // Session should be stored with key format: session:{token}
      expect(apiClient.getAuthToken()).toBe(sessionToken);

      // Verify session data structure
      const sessionData = apiClient.getSessionData();
      expect(sessionData).toMatchObject({
        deviceId: 'test-device-001',
        createdAt: expect.any(String),
        lastActivity: expect.any(String),
        metadata: expect.objectContaining({
          customerId: 'customer-123',
        }),
      });
    });

    it('should refresh session TTL on activity', async () => {
      apiClient = new ApiClient(config);
      await apiClient.authenticate();

      const initialSession = apiClient.getSessionData();

      // Wait a bit and send heartbeat
      vi.advanceTimersByTime(5000);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          acknowledged: true,
          commands: [],
          nextHeartbeat: 30000,
        }),
      });

      await apiClient.sendHeartbeat();

      const updatedSession = apiClient.getSessionData();
      expect(new Date(updatedSession.lastActivity).getTime()).toBeGreaterThan(
        new Date(initialSession.lastActivity).getTime()
      );
    });
  });
});
