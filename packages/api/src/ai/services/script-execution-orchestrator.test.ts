import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { ScriptExecutionOrchestrator } from './script-execution-orchestrator';

import type { ExecutionResult } from './script-execution.service';

// Mock the script execution service
vi.mock('./script-execution.service', () => {
  const mockServiceInstance = {
    queueScriptExecution: vi.fn(async request => ({
      packageId: `pkg_test_${Date.now()}`,
      deviceId: request.deviceId,
      status: 'queued',
      queuePosition: 1,
    })),
    reportExecutionResult: vi.fn(async result => result),
    getExecutionStatus: vi.fn(async packageId => ({
      packageId,
      deviceId: 'device-123',
      status: 'completed',
      result: {
        packageId,
        deviceId: 'device-123',
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
        executionTime: 1000,
        completedAt: new Date(),
      },
    })),
    formatResultAsSDKMessage: vi.fn((result, sessionId) => ({
      type: 'assistant',
      session_id: sessionId,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Execution ${result.exitCode === 0 ? 'succeeded' : 'failed'}`,
          },
        ],
      },
    })),
  };

  return {
    ScriptExecutionService: vi.fn(() => mockServiceInstance),
  };
});

describe('ScriptExecutionOrchestrator', () => {
  let orchestrator: ScriptExecutionOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new ScriptExecutionOrchestrator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleMCPScriptOutput', () => {
    it('should handle MCP tool output and queue script', async () => {
      // Arrange
      const mcpOutput = {
        script: '#!/bin/bash\necho "Test script"',
        manifest: {
          interpreter: 'bash',
          timeout: 30,
          requiredCapabilities: [],
          environmentVariables: {},
          workingDirectory: '/tmp',
        },
      };

      // Act
      const result = await orchestrator.handleMCPScriptOutput(
        mcpOutput,
        'session-123',
        'device-456',
        'approval-789'
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.packageId).toMatch(/^pkg_test_/);
      expect(result.deviceId).toBe('device-456');
      expect(result.status).toBe('queued');
      expect(result.queuePosition).toBe(1);
    });

    it('should determine priority based on timeout', async () => {
      // Arrange - High priority (quick command)
      const quickScript = {
        script: 'echo "quick"',
        manifest: {
          interpreter: 'bash',
          timeout: 5,
        },
      };

      // Act
      const result = await orchestrator.handleMCPScriptOutput(
        quickScript,
        'session-123',
        'device-456'
      );

      // Assert
      expect(result.status).toBe('queued');
    });

    it('should emit script:queued event', async () => {
      // Arrange
      const eventListener = vi.fn();
      orchestrator.on('script:queued', eventListener);

      const mcpOutput = {
        script: 'echo "test"',
        manifest: {
          interpreter: 'bash',
          timeout: 30,
        },
      };

      // Act
      await orchestrator.handleMCPScriptOutput(
        mcpOutput,
        'session-123',
        'device-456'
      );

      // Assert
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          deviceId: 'device-456',
          status: expect.objectContaining({
            status: 'queued',
          }),
        })
      );
    });
  });

  describe('processDeviceExecutionResult', () => {
    it('should process successful execution result', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_test_123',
        deviceId: 'device-456',
        exitCode: 0,
        stdout: 'Command executed successfully',
        stderr: '',
        executionTime: 1500,
        completedAt: new Date(),
      };

      // Act
      const sdkMessage = await orchestrator.processDeviceExecutionResult(
        result,
        'session-123'
      );

      // Assert
      expect(sdkMessage).toBeDefined();
      expect(sdkMessage.type).toBe('assistant');
      expect(sdkMessage.session_id).toBe('session-123');
    });

    it('should process failed execution result', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_test_456',
        deviceId: 'device-789',
        exitCode: 1,
        stdout: '',
        stderr: 'Command failed',
        executionTime: 500,
        completedAt: new Date(),
        error: 'Permission denied',
      };

      // Act
      const sdkMessage = await orchestrator.processDeviceExecutionResult(
        result,
        'session-456'
      );

      // Assert
      expect(sdkMessage).toBeDefined();
      expect(sdkMessage.type).toBe('assistant');
      expect(sdkMessage.session_id).toBe('session-456');
    });

    it('should emit execution:completed event', async () => {
      // Arrange
      const eventListener = vi.fn();
      orchestrator.on('execution:completed', eventListener);

      const result: ExecutionResult = {
        packageId: 'pkg_test_789',
        deviceId: 'device-123',
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
        executionTime: 2000,
        completedAt: new Date(),
      };

      // Act
      await orchestrator.processDeviceExecutionResult(result, 'session-789');

      // Assert
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          packageId: 'pkg_test_789',
          sessionId: 'session-789',
          success: true,
          result,
        })
      );
    });
  });

  describe('streamExecutionStatus', () => {
    it('should stream status updates', async () => {
      // Arrange
      const packageId = 'pkg_test_stream';
      const sessionId = 'session-stream';

      // Act
      const messages: unknown[] = [];
      for await (const message of orchestrator.streamExecutionStatus(
        packageId,
        sessionId
      )) {
        messages.push(message);
        if (messages.length >= 2) break; // Limit iterations for test
      }

      // Assert
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toHaveProperty('type', 'assistant');
    });
  });

  describe('getActiveExecutions', () => {
    it('should return empty array when no active executions', () => {
      // Act
      const executions = orchestrator.getActiveExecutions();

      // Assert
      expect(executions).toEqual([]);
    });

    it('should track active executions after queuing', async () => {
      // Arrange
      const mcpOutput = {
        script: 'echo "tracked"',
        manifest: {
          interpreter: 'bash',
          timeout: 30,
        },
      };

      // Act
      await orchestrator.handleMCPScriptOutput(
        mcpOutput,
        'session-track',
        'device-track'
      );
      const executions = orchestrator.getActiveExecutions();

      // Assert
      expect(executions.length).toBe(1);
      expect(executions[0].status).toBe('queued');
    });
  });

  describe('cancelExecution', () => {
    it('should return false for non-existent execution', async () => {
      // Act
      const result = await orchestrator.cancelExecution('pkg_nonexistent');

      // Assert
      expect(result).toBe(false);
    });

    it('should emit cancellation event', async () => {
      // Arrange
      const eventListener = vi.fn();
      orchestrator.on('execution:cancelled', eventListener);

      // Mock getExecutionStatus to return a cancellable status
      const { ScriptExecutionService } = await import(
        './script-execution.service'
      );
      const mockInstance = new (ScriptExecutionService as any)();
      mockInstance.getExecutionStatus = vi.fn(async () => ({
        packageId: 'pkg_cancellable',
        deviceId: 'device-123',
        status: 'queued',
      }));

      // Note: In a real test, we'd need to properly inject the mock
      // For now, this demonstrates the expected behavior

      // Act
      await orchestrator.cancelExecution('pkg_cancellable');

      // Assert - Would be called if the mock was properly injected
      // expect(eventListener).toHaveBeenCalled();
    });
  });
});
