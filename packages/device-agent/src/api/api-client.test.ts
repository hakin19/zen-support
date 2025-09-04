import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './api-client.js';
import type {
  ApiClientConfig,
  DeviceRegistrationResponse,
  HeartbeatResponse,
  CommandMessage,
  DiagnosticResult,
} from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiClient', () => {
  let apiClient: ApiClient;
  let config: ApiClientConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    config = {
      apiUrl: 'https://api.example.com',
      deviceId: 'test-device-123',
      deviceSecret: 'secret-key-456',
      customerId: 'customer-789',
      heartbeatInterval: 60000,
      maxRetries: 3,
      retryDelay: 1000,
    };

    apiClient = new ApiClient(config);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    apiClient.stop();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(apiClient).toBeDefined();
      expect(apiClient.getConnectionStatus()).toBe(false);
    });

    it('should throw error with missing apiUrl', () => {
      expect(() => new ApiClient({ ...config, apiUrl: '' })).toThrow(
        'API URL is required'
      );
    });

    it('should throw error with invalid apiUrl', () => {
      expect(() => new ApiClient({ ...config, apiUrl: 'not-a-url' })).toThrow(
        'Invalid API URL'
      );
    });

    it('should throw error with missing deviceId', () => {
      expect(() => new ApiClient({ ...config, deviceId: '' })).toThrow(
        'Device ID is required'
      );
    });

    it('should throw error with missing deviceSecret', () => {
      expect(() => new ApiClient({ ...config, deviceSecret: '' })).toThrow(
        'Device secret is required'
      );
    });

    it('should use default heartbeat interval if not provided', () => {
      const clientWithDefaults = new ApiClient({
        ...config,
        heartbeatInterval: undefined,
      });
      expect(clientWithDefaults).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('should authenticate successfully with valid credentials', async () => {
      const mockToken = 'jwt-token-abc';
      const mockResponse = {
        access_token: mockToken,
        expires_in: 3600,
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiClient.authenticate();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/device',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            device_id: config.deviceId,
            device_secret: config.deviceSecret,
          }),
        })
      );
    });

    it('should handle authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const result = await apiClient.authenticate();

      expect(result).toBe(false);
      expect(apiClient.getConnectionStatus()).toBe(false);
      expect(apiClient.getLastError()?.message).toContain(
        'API call failed: 401'
      );
    });

    it('should handle network errors during authentication', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await apiClient.authenticate();

      expect(result).toBe(false);
      expect(apiClient.getConnectionStatus()).toBe(false);
      expect(apiClient.getLastError()?.message).toContain(
        'Network request failed'
      );
    });

    it('should refresh token before expiration', async () => {
      const mockToken1 = 'jwt-token-1';
      const mockToken2 = 'jwt-token-2';

      // Initial authentication with refresh token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockToken1,
          expires_in: 3600,
          refresh_token: 'refresh-token-1',
          token_type: 'Bearer',
        }),
      });

      await apiClient.authenticate();
      vi.clearAllMocks();

      // Token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockToken2,
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const result = await apiClient.refreshToken();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'refresh-token-1' }),
        })
      );
    });
  });

  describe('device registration', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should register device successfully', async () => {
      const mockRegistrationResponse: DeviceRegistrationResponse = {
        device_id: config.deviceId,
        registered: true,
        customer_id: config.customerId,
        registration_date: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRegistrationResponse,
      });

      const result = await apiClient.registerDevice();

      expect(result).toEqual(mockRegistrationResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            device_id: config.deviceId,
            customer_id: config.customerId,
          }),
        })
      );
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid device data',
      });

      await expect(apiClient.registerDevice()).rejects.toThrow(
        'Device registration failed: 400'
      );
    });

    it('should throw error when not authenticated', async () => {
      apiClient = new ApiClient(config); // New instance without auth

      await expect(apiClient.registerDevice()).rejects.toThrow(
        'Not authenticated'
      );
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should send heartbeat successfully', async () => {
      const mockCommands: CommandMessage[] = [
        {
          id: 'cmd-1',
          type: 'diagnostic',
          command: 'ping',
          parameters: { target: '8.8.8.8', count: 4 },
          timestamp: new Date().toISOString(),
        },
      ];

      const mockHeartbeatResponse: HeartbeatResponse = {
        status: 'online',
        commands: mockCommands,
        server_time: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHeartbeatResponse,
      });

      const result = await apiClient.sendHeartbeat();

      expect(result).toEqual(mockHeartbeatResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/devices/heartbeat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        })
      );

      // Check body separately to handle timestamp
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.device_id).toBe(config.deviceId);
      expect(body.status).toBe('online');
      expect(body.timestamp).toBeDefined();
    });

    it('should poll for commands with heartbeat interval', async () => {
      const mockHeartbeatResponse: HeartbeatResponse = {
        status: 'online',
        commands: [],
        server_time: new Date().toISOString(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockHeartbeatResponse,
      });

      apiClient.startHeartbeat();

      // Verify initial heartbeat
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance to next heartbeat interval
      await vi.advanceTimersByTimeAsync(config.heartbeatInterval);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance again
      await vi.advanceTimersByTimeAsync(config.heartbeatInterval);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      apiClient.stopHeartbeat();
    });

    it('should emit commands received from heartbeat', async () => {
      const mockCommands: CommandMessage[] = [
        {
          id: 'cmd-1',
          type: 'diagnostic',
          command: 'ping',
          parameters: { target: '8.8.8.8' },
          timestamp: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'online',
          commands: mockCommands,
          server_time: new Date().toISOString(),
        }),
      });

      const commandHandler = vi.fn();
      apiClient.on('command', commandHandler);

      await apiClient.sendHeartbeat();

      expect(commandHandler).toHaveBeenCalledWith(mockCommands[0]);
    });

    it('should handle heartbeat errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const errorHandler = vi.fn();
      apiClient.on('error', errorHandler);

      const result = await apiClient.sendHeartbeat();

      expect(result).toBeNull();
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('diagnostic result submission', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      await apiClient.authenticate();
      vi.clearAllMocks();
    });

    it('should submit diagnostic result successfully', async () => {
      const diagnosticResult: DiagnosticResult = {
        command_id: 'cmd-1',
        device_id: config.deviceId,
        type: 'ping',
        status: 'success',
        result: {
          target: '8.8.8.8',
          packets_sent: 4,
          packets_received: 4,
          packet_loss: 0,
          min_rtt: 10.5,
          avg_rtt: 12.3,
          max_rtt: 14.1,
        },
        executed_at: new Date().toISOString(),
        duration_ms: 4500,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, id: 'result-123' }),
      });

      const result = await apiClient.submitDiagnosticResult(diagnosticResult);

      expect(result).toEqual({ success: true, id: 'result-123' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/diagnostics/results',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(diagnosticResult),
        })
      );
    });

    it('should retry on failure with exponential backoff', async () => {
      const diagnosticResult: DiagnosticResult = {
        command_id: 'cmd-1',
        device_id: config.deviceId,
        type: 'ping',
        status: 'success',
        result: { test: 'data' },
        executed_at: new Date().toISOString(),
        duration_ms: 100,
      };

      // First two attempts fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const resultPromise = apiClient.submitDiagnosticResult(diagnosticResult);

      // First retry after 1 second
      await vi.advanceTimersByTimeAsync(1000);

      // Second retry after 2 seconds
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const diagnosticResult: DiagnosticResult = {
        command_id: 'cmd-1',
        device_id: config.deviceId,
        type: 'ping',
        status: 'failure',
        error: 'Host unreachable',
        executed_at: new Date().toISOString(),
        duration_ms: 100,
      };

      // All attempts fail
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Start the async operation
      const resultPromise = apiClient.submitDiagnosticResult(diagnosticResult);

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry
      await vi.advanceTimersByTimeAsync(4000); // Third retry

      // Now await and check the rejection
      await expect(resultPromise).rejects.toThrow(
        'Failed to submit diagnostic result after 3 attempts'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle server errors without retry for 4xx', async () => {
      const diagnosticResult: DiagnosticResult = {
        command_id: 'cmd-1',
        device_id: config.deviceId,
        type: 'ping',
        status: 'success',
        result: {},
        executed_at: new Date().toISOString(),
        duration_ms: 100,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(
        apiClient.submitDiagnosticResult(diagnosticResult)
      ).rejects.toThrow('Diagnostic submission failed: 400');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for client errors
    });
  });

  describe('connection resilience', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
    });

    it('should reconnect automatically on connection loss', async () => {
      // Initial successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token-1',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await apiClient.authenticate();
      apiClient.startHeartbeat();

      // Simulate connection failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Then successful reconnection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token-2',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      // Heartbeat should succeed after reconnection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'online',
          commands: [],
          server_time: new Date().toISOString(),
        }),
      });

      // Trigger heartbeat which will fail and reconnect
      await vi.advanceTimersByTimeAsync(config.heartbeatInterval);

      // Allow reconnection
      await vi.advanceTimersByTimeAsync(5000);

      expect(apiClient.getConnectionStatus()).toBe(true);
      apiClient.stopHeartbeat();
    });

    it('should emit connection events', async () => {
      const connectedHandler = vi.fn();
      const disconnectedHandler = vi.fn();
      const reconnectingHandler = vi.fn();

      apiClient.on('connected', connectedHandler);
      apiClient.on('disconnected', disconnectedHandler);
      apiClient.on('reconnecting', reconnectingHandler);

      // Successful connection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await apiClient.authenticate();
      expect(connectedHandler).toHaveBeenCalled();

      // Reset mocks
      connectedHandler.mockClear();
      disconnectedHandler.mockClear();
      reconnectingHandler.mockClear();

      // Force a disconnection
      apiClient['setConnectionState']('disconnected');
      expect(disconnectedHandler).toHaveBeenCalled();

      // Force reconnecting state
      apiClient['setConnectionState']('reconnecting');
      expect(reconnectingHandler).toHaveBeenCalled();
    });

    it('should handle timeout correctly', async () => {
      // Create an AbortController to simulate timeout
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      const resultPromise = apiClient.authenticate();

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(30001);

      const result = await resultPromise;
      expect(result).toBe(false);
      expect(apiClient.getLastError()?.code).toBe('TIMEOUT');

      global.fetch = originalFetch;
    });

    it('should clean up resources on stop', async () => {
      // Reset fetch mock to avoid interference from previous test
      global.fetch = mockFetch;
      vi.clearAllMocks();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await apiClient.authenticate();

      // Mock heartbeat responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'online',
          commands: [],
          server_time: new Date().toISOString(),
        }),
      });

      apiClient.startHeartbeat();

      // Wait for initial heartbeat
      await vi.advanceTimersByTimeAsync(100);

      const callCountBeforeStop = mockFetch.mock.calls.length;

      apiClient.stop();

      // Clear pending timers to prevent further calls
      vi.clearAllTimers();

      // Verify no more calls were made
      expect(mockFetch.mock.calls.length).toBe(callCountBeforeStop);
      expect(apiClient.getConnectionStatus()).toBe(false);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should emit detailed error events', async () => {
      // Create a new client to isolate this test
      const testClient = new ApiClient(config);
      const errorHandler = vi.fn();
      testClient.on('error', errorHandler);

      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'jwt-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await testClient.authenticate();

      // Now cause an error in heartbeat which does emit errors
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await testClient.sendHeartbeat();

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Network request failed'),
        })
      );

      testClient.stop();
    });

    it('should track last error state', async () => {
      // Create a new client to isolate this test
      const testClient = new ApiClient(config);
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      const result = await testClient.authenticate();
      expect(result).toBe(false);

      const lastError = testClient.getLastError();
      expect(lastError).toBeDefined();
      expect(lastError!.message).toContain('Network request failed');

      testClient.stop();
    });

    it('should handle malformed responses gracefully', async () => {
      // Create a new client to isolate this test
      const testClient = new ApiClient(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await testClient.authenticate();

      expect(result).toBe(false);
      const lastError = testClient.getLastError();
      expect(lastError).toBeDefined();
      // The JSON error gets wrapped in ApiClientError
      expect(lastError!.message).toBe('Invalid response format');
      expect((lastError!.originalError as Error).message).toBe('Invalid JSON');

      testClient.stop();
    });
  });
});
