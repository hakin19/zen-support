import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { ScriptExecutionService } from './script-execution.service';

import type { ScriptExecutionRequest } from './script-execution.service';

// Mock dependencies
vi.mock('@aizen/shared', () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
          })),
          single: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  })),
}));

vi.mock('@aizen/shared/utils/redis-client', () => ({
  getRedisClient: vi.fn(() => ({
    lpush: vi.fn(),
    rpush: vi.fn(),
    lrange: vi.fn(() => []),
    publish: vi.fn(),
  })),
}));

vi.mock('./script-packager.service', () => {
  const mockPackagerInstance = {
    packageScript: vi.fn(async (script, manifest, approvalId) => ({
      id: `pkg_${Math.random().toString(36).substring(7)}`,
      script: Buffer.from(script).toString('base64'),
      manifest,
      checksum: 'checksum123',
      signature: 'signature123',
      createdAt: new Date(),
      approvalId,
    })),
    validateChecksum: vi.fn(() => true),
    verifyPackage: vi.fn(async () => true),
    processExecutionResult: vi.fn(async result => result),
  };

  return {
    ScriptPackagerService: vi.fn(() => mockPackagerInstance),
  };
});

describe('ScriptExecutionService', () => {
  let service: ScriptExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScriptExecutionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('queueScriptExecution', () => {
    it('should queue a script for execution', async () => {
      // Arrange
      const request: ScriptExecutionRequest = {
        sessionId: 'session-123',
        deviceId: 'device-456',
        script: '#!/bin/bash\necho "Hello"',
        manifest: {
          interpreter: 'bash',
          timeout: 30,
          requiredCapabilities: [],
          environmentVariables: {},
          workingDirectory: '/tmp',
          maxRetries: 0,
          retryDelay: 5,
        },
        approvalId: 'approval-789',
        priority: 'medium',
      };

      // Act
      const result = await service.queueScriptExecution(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.packageId).toMatch(/^pkg_/);
      expect(result.deviceId).toBe('device-456');
      expect(result.status).toBe('queued');
    });

    it('should handle high priority scripts', async () => {
      // Arrange
      const request: ScriptExecutionRequest = {
        sessionId: 'session-123',
        deviceId: 'device-456',
        script: 'echo "urgent"',
        manifest: {
          interpreter: 'bash',
          timeout: 10,
          requiredCapabilities: [],
          environmentVariables: {},
          workingDirectory: '/tmp',
          maxRetries: 0,
          retryDelay: 5,
        },
        priority: 'high',
      };

      // Act
      const result = await service.queueScriptExecution(request);

      // Assert
      expect(result.status).toBe('queued');
      expect(result.deviceId).toBe('device-456');
    });
  });

  describe('getPackageForExecution', () => {
    it('should return null for non-existent package', async () => {
      // Act
      const result = await service.getPackageForExecution(
        'pkg_nonexistent',
        'device-456'
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('reportExecutionResult', () => {
    it('should process execution result', async () => {
      // Arrange
      const executionResult = {
        packageId: 'pkg_123',
        deviceId: 'device-456',
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
        executionTime: 1500,
        completedAt: new Date(),
      };

      // Act
      const result = await service.reportExecutionResult(executionResult);

      // Assert
      expect(result).toEqual(executionResult);
    });

    it('should handle failed execution', async () => {
      // Arrange
      const executionResult = {
        packageId: 'pkg_123',
        deviceId: 'device-456',
        exitCode: 1,
        stdout: '',
        stderr: 'Error occurred',
        executionTime: 500,
        completedAt: new Date(),
        error: 'Script failed',
      };

      // Act
      const result = await service.reportExecutionResult(executionResult);

      // Assert
      expect(result).toEqual(executionResult);
    });
  });

  describe('getExecutionStatus', () => {
    it('should return null for non-existent package', async () => {
      // Act
      const result = await service.getExecutionStatus('pkg_nonexistent');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('formatResultAsSDKMessage', () => {
    it('should format successful result as SDK message', () => {
      // Arrange
      const result = {
        packageId: 'pkg_123',
        deviceId: 'device-456',
        exitCode: 0,
        stdout: 'Operation completed',
        stderr: '',
        executionTime: 2000,
        completedAt: new Date(),
      };

      // Act
      const message = service.formatResultAsSDKMessage(result, 'session-123');

      // Assert
      expect(message.type).toBe('assistant');
      expect(message.session_id).toBe('session-123');
      expect(message.message?.content?.[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('completed successfully'),
      });
    });

    it('should format failed result as SDK message', () => {
      // Arrange
      const result = {
        packageId: 'pkg_123',
        deviceId: 'device-456',
        exitCode: 1,
        stdout: '',
        stderr: 'Permission denied',
        executionTime: 100,
        completedAt: new Date(),
      };

      // Act
      const message = service.formatResultAsSDKMessage(result, 'session-123');

      // Assert
      expect(message.type).toBe('assistant');
      expect(message.session_id).toBe('session-123');
      expect(message.message?.content?.[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('failed'),
      });
    });
  });
});
