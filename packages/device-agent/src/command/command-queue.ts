import { EventEmitter } from 'events';

import PQueue from 'p-queue';

import type { DiagnosticCommand, DiagnosticResult } from '../types';

export interface CommandQueueConfig {
  deviceId?: string;
  maxConcurrency?: number;
  defaultTimeout?: number;
  maxRetries?: number;
  maxOutputSize?: number;
}

export interface QueueLengths {
  high: number;
  normal: number;
  low: number;
  total: number;
}

export interface CommandStatistics {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  avgExecutionTime: number;
  timeoutCount: number;
}

export interface CommandStatus {
  id: string;
  status: 'queued' | 'executing' | 'completed' | 'failed' | 'timeout';
}

type CommandExecutor = (
  command: DiagnosticCommand
) => Promise<DiagnosticResult>;

interface QueuedCommand {
  command: DiagnosticCommand;
  retryCount: number;
  addedAt: number;
}

export class CommandQueue extends EventEmitter {
  #config: Required<Omit<CommandQueueConfig, 'deviceId'>> & {
    deviceId: string;
  };
  #queues: {
    high: Map<string, QueuedCommand>;
    normal: Map<string, QueuedCommand>;
    low: Map<string, QueuedCommand>;
  };
  #pQueue: PQueue;
  #executor?: CommandExecutor;
  #statistics: CommandStatistics;
  #commandStatus: Map<string, CommandStatus>;
  #isStopped: boolean = false;
  #activeCommands: Set<string> = new Set();
  #executionTimes: number[] = [];

  constructor(config: CommandQueueConfig = {}) {
    super();

    this.#config = {
      deviceId: config.deviceId ?? 'unknown',
      maxConcurrency: config.maxConcurrency ?? 2,
      defaultTimeout: config.defaultTimeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      maxOutputSize: config.maxOutputSize ?? 1024 * 1024, // 1MB
    };

    this.#queues = {
      high: new Map(),
      normal: new Map(),
      low: new Map(),
    };

    this.#pQueue = new PQueue({
      concurrency: this.#config.maxConcurrency,
      autoStart: false,
    });

    this.#statistics = {
      totalProcessed: 0,
      successCount: 0,
      failureCount: 0,
      avgExecutionTime: 0,
      timeoutCount: 0,
    };

    this.#commandStatus = new Map();
  }

  setExecutor(executor: CommandExecutor): void {
    this.#executor = executor;
  }

  enqueue(command: DiagnosticCommand): void {
    const priority = command.priority || 'normal';
    const queue = this.#queues[priority];

    // Skip if command already exists in any queue (duplicate ID)
    if (
      this.#queues.high.has(command.id) ||
      this.#queues.normal.has(command.id) ||
      this.#queues.low.has(command.id)
    ) {
      return;
    }

    const queuedCommand: QueuedCommand = {
      command,
      retryCount: 0,
      addedAt: Date.now(),
    };

    queue.set(command.id, queuedCommand);
    this.#updateCommandStatus(command.id, 'queued');
  }

  async processAll(): Promise<DiagnosticResult[]> {
    if (this.#isStopped) {
      return [];
    }

    const commands = this.#getAllCommandsInPriority();

    // Clear the p-queue and add all commands
    this.#pQueue.clear();

    const promises: Promise<DiagnosticResult>[] = [];

    for (const queuedCommand of commands) {
      if (this.#isStopped) {
        break;
      }

      const resultPromise = this.#pQueue.add(async () => {
        if (this.#isStopped) {
          return this.#createFailedResult(
            queuedCommand.command,
            'Processing stopped'
          );
        }

        return this.#executeCommand(queuedCommand);
      });

      if (resultPromise !== undefined) {
        promises.push(resultPromise as Promise<DiagnosticResult>);
      }
    }

    // Start processing
    this.#pQueue.start();

    // Wait for all commands to complete
    const resolvedResults = await Promise.all(promises);

    // Clear processed commands from queues
    this.#clearProcessedCommands();

    return resolvedResults;
  }

  pause(): void {
    this.#pQueue.pause();
  }

  resume(): void {
    this.#pQueue.start();
  }

  async stop(): Promise<void> {
    this.#isStopped = true;
    this.#pQueue.pause();
    this.#pQueue.clear();

    // Wait for active commands to complete with a timeout
    const maxWaitTime = 1000; // 1 second max wait
    const startTime = Date.now();

    while (this.#activeCommands.size > 0) {
      if (Date.now() - startTime > maxWaitTime) {
        // Force clear if taking too long (e.g., in tests with fake timers)
        this.#activeCommands.clear();
        break;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  clearAll(): void {
    this.#queues.high.clear();
    this.#queues.normal.clear();
    this.#queues.low.clear();
    this.#commandStatus.clear();
    this.#pQueue.clear();
  }

  getQueueLengths(): QueueLengths {
    return {
      high: this.#queues.high.size,
      normal: this.#queues.normal.size,
      low: this.#queues.low.size,
      total:
        this.#queues.high.size +
        this.#queues.normal.size +
        this.#queues.low.size,
    };
  }

  getStatistics(): CommandStatistics {
    return { ...this.#statistics };
  }

  #getAllCommandsInPriority(): QueuedCommand[] {
    return [
      ...Array.from(this.#queues.high.values()),
      ...Array.from(this.#queues.normal.values()),
      ...Array.from(this.#queues.low.values()),
    ];
  }

  #clearProcessedCommands(): void {
    const clearQueue = (queue: Map<string, QueuedCommand>): void => {
      for (const [id] of queue.entries()) {
        const status = this.#commandStatus.get(id);
        if (
          status &&
          ['completed', 'failed', 'timeout'].includes(status.status)
        ) {
          queue.delete(id);
          // Also clear status map to avoid unbounded growth
          this.#commandStatus.delete(id);
        }
      }
    };

    clearQueue(this.#queues.high);
    clearQueue(this.#queues.normal);
    clearQueue(this.#queues.low);
  }

  async #executeCommand(
    queuedCommand: QueuedCommand
  ): Promise<DiagnosticResult> {
    const { command, retryCount } = queuedCommand;

    // Check if command is expired
    if (this.#isCommandExpired(command)) {
      this.#updateCommandStatus(command.id, 'failed');
      return this.#createFailedResult(command, 'Command expired');
    }

    // Check if executor is set
    if (!this.#executor) {
      this.#updateCommandStatus(command.id, 'failed');
      return this.#createFailedResult(command, 'Command executor not set');
    }

    // Check for malformed commands
    if (!this.#validateCommand(command)) {
      this.#updateCommandStatus(command.id, 'failed');
      return this.#createFailedResult(command, 'Invalid command structure');
    }

    this.#updateCommandStatus(command.id, 'executing');
    this.#activeCommands.add(command.id);

    const startTime = Date.now();
    const timeout = command.parameters?.timeout ?? this.#config.defaultTimeout;

    let timeoutId: NodeJS.Timeout | undefined;

    try {
      // Create timeout promise with clearable timer
      const timeoutPromise = new Promise<DiagnosticResult>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Command execution timeout')),
          timeout
        );
      });

      // Execute command with timeout
      const result = await Promise.race([
        this.#executor(command),
        timeoutPromise,
      ]);

      // Clear timeout if command completed successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Enforce output size limit
      if (
        result.results.output &&
        result.results.output.length > this.#config.maxOutputSize
      ) {
        result.results.output = `${result.results.output.substring(
          0,
          this.#config.maxOutputSize - 12
        )}\n[truncated]`;
      }

      // Update statistics
      const duration = Date.now() - startTime;
      this.#updateStatistics(true, duration);
      this.#updateCommandStatus(command.id, 'completed');

      this.#activeCommands.delete(command.id);
      return result;
    } catch (error) {
      // Clear timeout in all error cases
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const isTimeout =
        error instanceof Error && error.message.includes('timeout');

      if (isTimeout) {
        this.#updateStatistics(false, Date.now() - startTime, true);
        this.#updateCommandStatus(command.id, 'timeout');
        this.#activeCommands.delete(command.id);
        return this.#createTimeoutResult(command);
      }

      // Retry logic for non-timeout errors
      if (retryCount < this.#config.maxRetries - 1) {
        queuedCommand.retryCount++;
        this.#activeCommands.delete(command.id);
        try {
          return await this.#executeCommand(queuedCommand);
        } catch (retryError) {
          // If the retry also fails, return the failed result
          // The error has already been emitted by the recursive call
          return this.#createFailedResult(
            command,
            retryError instanceof Error ? retryError.message : 'Unknown error'
          );
        }
      }

      // Max retries exceeded
      this.#updateStatistics(false, Date.now() - startTime);
      this.#updateCommandStatus(command.id, 'failed');
      this.emit('error', error);

      this.#activeCommands.delete(command.id);
      return this.#createFailedResult(
        command,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  #isCommandExpired(command: DiagnosticCommand): boolean {
    return new Date(command.expiresAt).getTime() < Date.now();
  }

  #validateCommand(command: DiagnosticCommand): boolean {
    return !!(
      command.id &&
      command.type &&
      command.createdAt &&
      command.expiresAt
    );
  }

  #updateCommandStatus(id: string, status: CommandStatus['status']): void {
    const statusUpdate: CommandStatus = { id, status };
    this.#commandStatus.set(id, statusUpdate);
    this.emit('statusUpdate', statusUpdate);
  }

  #updateStatistics(
    success: boolean,
    duration: number,
    isTimeout: boolean = false
  ): void {
    this.#statistics.totalProcessed++;

    if (success) {
      this.#statistics.successCount++;
      // Only track successful execution times for average
      this.#executionTimes.push(duration);
      this.#statistics.avgExecutionTime =
        this.#executionTimes.reduce((sum, time) => sum + time, 0) /
        this.#executionTimes.length;
    } else {
      this.#statistics.failureCount++;
      if (isTimeout) {
        this.#statistics.timeoutCount++;
      }
    }
  }

  #createFailedResult(
    command: DiagnosticCommand,
    error: string
  ): DiagnosticResult {
    return {
      commandId: command.id,
      deviceId: this.#config.deviceId,
      status: 'failed',
      results: {
        error,
      },
      executedAt: new Date().toISOString(),
      duration: 0,
    };
  }

  #createTimeoutResult(command: DiagnosticCommand): DiagnosticResult {
    return {
      commandId: command.id,
      deviceId: this.#config.deviceId,
      status: 'timeout',
      results: {
        error: `Command execution timeout after ${command.parameters?.timeout ?? this.#config.defaultTimeout}ms`,
      },
      executedAt: new Date().toISOString(),
      duration: command.parameters?.timeout ?? this.#config.defaultTimeout,
    };
  }
}
