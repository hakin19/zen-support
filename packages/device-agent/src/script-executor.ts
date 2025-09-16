import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { writeFile, unlink, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface ScriptPackage {
  packageId: string;
  deviceId: string;
  content: string;
  checksum: string;
  timeout?: number;
  interpreter?: 'bash' | 'python' | 'node';
}

export interface ExecutionResult {
  packageId: string;
  deviceId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTime: number;
  completedAt: Date;
  error?: string;
}

export class ScriptExecutor extends EventEmitter {
  private activeExecutions: Map<string, ChildProcess> = new Map();
  private executionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Execute a script package
   */
  async execute(pkg: ScriptPackage): Promise<ExecutionResult> {
    const startTime = Date.now();
    const tempFilePath = join(tmpdir(), `script_${pkg.packageId}.sh`);

    try {
      // Verify checksum
      const calculatedChecksum = createHash('sha256')
        .update(pkg.content)
        .digest('hex');

      if (calculatedChecksum !== pkg.checksum) {
        return this.createErrorResult(pkg, 'Checksum mismatch', startTime);
      }

      // Write script to temp file
      await writeFile(tempFilePath, pkg.content, 'utf8');
      await chmod(tempFilePath, 0o700); // rwx------

      // Determine interpreter
      const interpreter = this.getInterpreter(pkg.interpreter);

      // Execute script with timeout
      const result = await this.executeWithTimeout(
        pkg,
        interpreter,
        tempFilePath,
        pkg.timeout ?? 30000
      );

      // Clean up temp file
      await unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

      const executionTime = Date.now() - startTime;

      return {
        packageId: pkg.packageId,
        deviceId: pkg.deviceId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime,
        completedAt: new Date(),
      };
    } catch (error) {
      // Clean up temp file on error
      await unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

      return this.createErrorResult(
        pkg,
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }

  /**
   * Cancel an active script execution
   */
  async cancelExecution(packageId: string): Promise<boolean> {
    const process = this.activeExecutions.get(packageId);
    const timeout = this.executionTimeouts.get(packageId);

    if (timeout) {
      clearTimeout(timeout);
      this.executionTimeouts.delete(packageId);
    }

    if (process) {
      try {
        // First try SIGTERM
        process.kill('SIGTERM');

        // Give process 5 seconds to terminate gracefully
        await new Promise<void>(resolve => {
          const killTimeout = setTimeout(() => {
            // Force kill if still running
            if (!process.killed) {
              process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          process.once('exit', () => {
            clearTimeout(killTimeout);
            resolve();
          });
        });

        this.activeExecutions.delete(packageId);
        this.emit('execution:cancelled', { packageId });
        return true;
      } catch (error) {
        console.error('Failed to cancel execution:', error);
        return false;
      }
    }

    return false;
  }

  /**
   * Execute script with timeout
   */
  private executeWithTimeout(
    pkg: ScriptPackage,
    interpreter: string,
    scriptPath: string,
    timeout: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const args = interpreter === 'bash' ? ['-e', scriptPath] : [scriptPath];
      const child = spawn(interpreter, args, {
        env: {
          ...process.env,
          PACKAGE_ID: pkg.packageId,
          DEVICE_ID: pkg.deviceId,
        },
      });

      this.activeExecutions.set(pkg.packageId, child);

      let stdout = '';
      let stderr = '';
      const maxOutputSize = 1024 * 1024; // 1MB max per stream

      child.stdout.on('data', data => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= maxOutputSize) {
          stdout += chunk;
        } else if (stdout.length < maxOutputSize) {
          stdout += chunk.substring(0, maxOutputSize - stdout.length);
          stdout += '\n[Output truncated]';
        }
      });

      child.stderr.on('data', data => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= maxOutputSize) {
          stderr += chunk;
        } else if (stderr.length < maxOutputSize) {
          stderr += chunk.substring(0, maxOutputSize - stderr.length);
          stderr += '\n[Output truncated]';
        }
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
        reject(new Error(`Script execution timeout after ${timeout}ms`));
      }, timeout);

      this.executionTimeouts.set(pkg.packageId, timeoutId);

      child.on('error', error => {
        clearTimeout(timeoutId);
        this.activeExecutions.delete(pkg.packageId);
        this.executionTimeouts.delete(pkg.packageId);
        reject(error);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeoutId);
        this.activeExecutions.delete(pkg.packageId);
        this.executionTimeouts.delete(pkg.packageId);

        if (signal) {
          reject(new Error(`Script terminated by signal: ${signal}`));
        } else {
          resolve({
            exitCode: code ?? 1,
            stdout,
            stderr,
          });
        }
      });
    });
  }

  /**
   * Get interpreter command based on type
   */
  private getInterpreter(type?: 'bash' | 'python' | 'node'): string {
    switch (type) {
      case 'python':
        return 'python3';
      case 'node':
        return 'node';
      case 'bash':
      default:
        return 'bash';
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(
    pkg: ScriptPackage,
    error: string,
    startTime: number
  ): ExecutionResult {
    return {
      packageId: pkg.packageId,
      deviceId: pkg.deviceId,
      exitCode: 1,
      stdout: '',
      stderr: error,
      executionTime: Date.now() - startTime,
      completedAt: new Date(),
      error,
    };
  }

  /**
   * Clean up all active executions
   */
  async cleanup(): Promise<void> {
    const cancellations = Array.from(this.activeExecutions.keys()).map(id =>
      this.cancelExecution(id)
    );
    await Promise.all(cancellations);
  }
}
