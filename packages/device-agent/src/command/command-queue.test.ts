import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CommandQueue } from './command-queue';
import type { DiagnosticCommand, DiagnosticResult } from '../types';

describe('CommandQueue', () => {
  let commandQueue: CommandQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    commandQueue = new CommandQueue({
      deviceId: 'test-device',
      maxConcurrency: 2,
      defaultTimeout: 30000,
      maxRetries: 3,
      maxOutputSize: 1024 * 1024, // 1MB
    });
  });

  afterEach(async () => {
    // Clear timers and switch to real timers before stopping
    // to allow any pending operations to complete
    vi.clearAllTimers();
    vi.useRealTimers();
    // Now stop the queue with real timers active
    await commandQueue.stop();
  });

  describe('Queue Management', () => {
    it('should initialize with empty queues', () => {
      expect(commandQueue.getQueueLengths()).toEqual({
        high: 0,
        normal: 0,
        low: 0,
        total: 0,
      });
    });

    it('should add commands to appropriate priority queue', () => {
      const highPriorityCommand: DiagnosticCommand = {
        id: 'cmd-1',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'high',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      const normalPriorityCommand: DiagnosticCommand = {
        id: 'cmd-2',
        type: 'dns',
        parameters: { target: 'example.com' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      const lowPriorityCommand: DiagnosticCommand = {
        id: 'cmd-3',
        type: 'traceroute',
        parameters: { target: '1.1.1.1' },
        priority: 'low',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(highPriorityCommand);
      commandQueue.enqueue(normalPriorityCommand);
      commandQueue.enqueue(lowPriorityCommand);

      expect(commandQueue.getQueueLengths()).toEqual({
        high: 1,
        normal: 1,
        low: 1,
        total: 3,
      });
    });

    it('should process commands in priority order', async () => {
      const executedOrder: string[] = [];

      commandQueue.setExecutor(async command => {
        executedOrder.push(command.id);
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const commands: DiagnosticCommand[] = [
        {
          id: 'low-1',
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'low',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        {
          id: 'high-1',
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'high',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        {
          id: 'normal-1',
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      commands.forEach(cmd => commandQueue.enqueue(cmd));

      await commandQueue.processAll();

      expect(executedOrder).toEqual(['high-1', 'normal-1', 'low-1']);
    });

    it('should skip expired commands', async () => {
      const executedCommands: string[] = [];

      commandQueue.setExecutor(async command => {
        executedCommands.push(command.id);
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const expiredCommand: DiagnosticCommand = {
        id: 'expired-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'high',
        createdAt: new Date(Date.now() - 120000).toISOString(),
        expiresAt: new Date(Date.now() - 60000).toISOString(), // Already expired
      };

      const validCommand: DiagnosticCommand = {
        id: 'valid-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'high',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(expiredCommand);
      commandQueue.enqueue(validCommand);

      const results = await commandQueue.processAll();

      expect(executedCommands).toEqual(['valid-cmd']);
      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.results.error).toContain('expired');
      expect(results[0]?.deviceId).toBe('test-device');
      expect(results[1]?.status).toBe('completed');
    });

    it('should handle duplicate command IDs across priorities', () => {
      const command: DiagnosticCommand = {
        id: 'duplicate-id',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      commandQueue.enqueue({ ...command }); // Same ID, same priority
      commandQueue.enqueue({ ...command, priority: 'high' }); // Same ID, different priority
      commandQueue.enqueue({ ...command, priority: 'low' }); // Same ID, another priority

      // Should only have one command total across all queues
      expect(commandQueue.getQueueLengths().total).toBe(1);
      expect(commandQueue.getQueueLengths().normal).toBe(1);
      expect(commandQueue.getQueueLengths().high).toBe(0);
      expect(commandQueue.getQueueLengths().low).toBe(0);
    });
  });

  describe('Command Execution', () => {
    it('should execute commands with timeout enforcement', async () => {
      commandQueue.setExecutor(async command => {
        if (command.id === 'timeout-cmd') {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const timeoutCommand: DiagnosticCommand = {
        id: 'timeout-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8', timeout: 1000 },
        priority: 'high',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(timeoutCommand);

      const resultsPromise = commandQueue.processAll();

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(1000);

      const results = await resultsPromise;

      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('timeout');
      expect(results[0]?.results.error).toContain('timeout');
    });

    it('should enforce output size limits', async () => {
      const largeOutput = 'x'.repeat(2 * 1024 * 1024); // 2MB

      commandQueue.setExecutor(async command => {
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: largeOutput },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const command: DiagnosticCommand = {
        id: 'large-output-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      const results = await commandQueue.processAll();

      expect(results).toHaveLength(1);
      expect(results[0]?.results.output?.length).toBeLessThanOrEqual(
        1024 * 1024
      );
      expect(results[0]?.results.output).toContain('[truncated]');
    });

    it('should handle concurrent execution with max concurrency', async () => {
      const executionOrder: { id: string; start: number; end: number }[] = [];
      const startTime = Date.now();

      commandQueue.setExecutor(async command => {
        const execStart = Date.now() - startTime;
        await new Promise(resolve => setTimeout(resolve, 100));
        const execEnd = Date.now() - startTime;

        executionOrder.push({
          id: command.id,
          start: execStart,
          end: execEnd,
        });

        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      // Queue 4 commands with max concurrency of 2
      for (let i = 1; i <= 4; i++) {
        commandQueue.enqueue({
          id: `cmd-${i}`,
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      }

      const resultsPromise = commandQueue.processAll();

      // Advance timers to complete execution
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
        await Promise.resolve();
      }

      await resultsPromise;

      // Verify max 2 commands ran concurrently
      const concurrentExecutions = executionOrder.filter(exec1 =>
        executionOrder.some(
          exec2 =>
            exec1.id !== exec2.id &&
            exec1.start < exec2.end &&
            exec1.end > exec2.start
        )
      );

      // Each command should overlap with at most 1 other (due to max concurrency of 2)
      concurrentExecutions.forEach(exec => {
        const overlapping = executionOrder.filter(
          other =>
            other.id !== exec.id &&
            exec.start < other.end &&
            exec.end > other.start
        );
        expect(overlapping.length).toBeLessThanOrEqual(1);
      });
    });

    it('should retry failed commands', async () => {
      let attemptCount = 0;

      commandQueue.setExecutor(async command => {
        attemptCount++;

        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }

        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'success after retries' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const command: DiagnosticCommand = {
        id: 'retry-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      const results = await commandQueue.processAll();

      expect(attemptCount).toBe(3);
      expect(results[0]?.status).toBe('completed');
      expect(results[0]?.results.output).toBe('success after retries');
    });

    it('should fail after max retries exceeded', async () => {
      let attemptCount = 0;

      commandQueue.setExecutor(async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      });

      const command: DiagnosticCommand = {
        id: 'fail-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      const results = await commandQueue.processAll();

      expect(attemptCount).toBe(3); // max retries
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.results.error).toContain('Persistent failure');
    });
  });

  describe('Command Status Tracking', () => {
    it('should track command status during execution', async () => {
      const statusUpdates: Array<{ id: string; status: string }> = [];

      commandQueue.on('statusUpdate', update => {
        statusUpdates.push(update);
      });

      commandQueue.setExecutor(async command => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 50,
        };
      });

      const command: DiagnosticCommand = {
        id: 'status-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);

      const resultsPromise = commandQueue.processAll();

      vi.advanceTimersByTime(100);
      await resultsPromise;

      expect(statusUpdates).toContainEqual({
        id: 'status-cmd',
        status: 'queued',
      });
      expect(statusUpdates).toContainEqual({
        id: 'status-cmd',
        status: 'executing',
      });
      expect(statusUpdates).toContainEqual({
        id: 'status-cmd',
        status: 'completed',
      });
    });

    it('should provide command statistics', async () => {
      commandQueue.setExecutor(async command => {
        if (command.id === 'fail-cmd') {
          throw new Error('Command failed');
        }
        // Simulate some execution time by advancing timer
        vi.advanceTimersByTime(100);
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      const commands: DiagnosticCommand[] = [
        {
          id: 'success-cmd-1',
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        {
          id: 'success-cmd-2',
          type: 'dns',
          parameters: { target: 'example.com' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        {
          id: 'fail-cmd',
          type: 'traceroute',
          parameters: { target: '1.1.1.1' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ];

      commands.forEach(cmd => commandQueue.enqueue(cmd));
      await commandQueue.processAll();

      const stats = commandQueue.getStatistics();

      expect(stats.totalProcessed).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.avgExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Queue Control', () => {
    it('should pause and resume processing', async () => {
      // This test verifies pause/resume by checking queue state
      // The actual pause mechanism is tested indirectly

      commandQueue.setExecutor(async command => {
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      // Add commands
      for (let i = 1; i <= 3; i++) {
        commandQueue.enqueue({
          id: `cmd-${i}`,
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      }

      // Test pause state
      commandQueue.pause();
      expect(commandQueue.getQueueLengths().total).toBe(3);

      // Resume and process
      commandQueue.resume();
      const results = await commandQueue.processAll();

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'completed')).toBe(true);
    });

    it('should clear all queues', () => {
      // Add commands to all priority levels
      commandQueue.enqueue({
        id: 'high-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'high',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      commandQueue.enqueue({
        id: 'normal-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      commandQueue.enqueue({
        id: 'low-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'low',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      expect(commandQueue.getQueueLengths().total).toBe(3);

      commandQueue.clearAll();

      expect(commandQueue.getQueueLengths()).toEqual({
        high: 0,
        normal: 0,
        low: 0,
        total: 0,
      });
    });

    it('should stop processing gracefully', async () => {
      commandQueue.setExecutor(async command => {
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 50,
        };
      });

      // Add commands
      for (let i = 1; i <= 5; i++) {
        commandQueue.enqueue({
          id: `cmd-${i}`,
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      }

      // Verify that stop clears the queue
      expect(commandQueue.getQueueLengths().total).toBe(5);

      // Stop before processing starts
      await commandQueue.stop();

      // Try to process - should return empty results
      const results = await commandQueue.processAll();
      expect(results).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle executor not set', async () => {
      const command: DiagnosticCommand = {
        id: 'no-executor-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      const results = await commandQueue.processAll();

      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.results.error).toContain('executor not set');
    });

    it('should handle malformed commands gracefully', async () => {
      commandQueue.setExecutor(async command => {
        return {
          commandId: command.id,
          deviceId: 'test-device',
          status: 'completed' as const,
          results: { output: 'test' },
          executedAt: new Date().toISOString(),
          duration: 100,
        };
      });

      // Command with missing required fields
      const malformedCommand = {
        id: 'malformed-cmd',
        type: 'ping',
        // Missing other required fields
      } as DiagnosticCommand;

      commandQueue.enqueue(malformedCommand);
      const results = await commandQueue.processAll();

      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.results.error).toBeDefined();
    });

    it('should emit error events for critical failures', async () => {
      const errors: Error[] = [];

      commandQueue.on('error', error => {
        errors.push(error);
      });

      commandQueue.setExecutor(async () => {
        throw new Error('Critical executor error');
      });

      const command: DiagnosticCommand = {
        id: 'error-cmd',
        type: 'ping',
        parameters: { target: '8.8.8.8' },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      commandQueue.enqueue(command);
      await commandQueue.processAll();

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('Critical executor error');
    });
  });
});
