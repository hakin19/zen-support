import { EventEmitter } from 'events';

import { ScriptExecutionService } from './script-execution.service';

import type {
  ScriptExecutionRequest,
  ExecutionStatus,
} from './script-execution.service';
import type { ExecutionResult } from './script-packager.service';
import type { SDKMessage } from '@anthropic-ai/claude-code';

/**
 * Orchestrates script execution flow between AI, device agents, and SDK pipeline
 * Handles the complete lifecycle from AI-generated scripts to device execution and result reporting
 */
export class ScriptExecutionOrchestrator extends EventEmitter {
  private executionService: ScriptExecutionService;
  private activeExecutions: Map<string, ExecutionStatus> = new Map();

  constructor() {
    super();
    this.executionService = new ScriptExecutionService();
  }

  /**
   * Handle script generation output from MCP tools
   * @param mcpToolOutput - Output from script generation tool
   * @param sessionId - Current session ID
   * @param deviceId - Target device ID
   * @param approvalId - Optional approval ID from HITL
   * @returns Execution status
   */
  async handleMCPScriptOutput(
    mcpToolOutput: {
      script: string;
      manifest: Record<string, unknown>;
    },
    sessionId: string,
    deviceId: string,
    approvalId?: string
  ): Promise<ExecutionStatus> {
    // Create execution request from MCP output
    const request: ScriptExecutionRequest = {
      sessionId,
      deviceId,
      script: mcpToolOutput.script,
      manifest: {
        interpreter:
          (mcpToolOutput.manifest.interpreter as
            | 'bash'
            | 'sh'
            | 'python3'
            | 'node') ?? 'bash',
        timeout: (mcpToolOutput.manifest.timeout as number) ?? 60,
        requiredCapabilities:
          (mcpToolOutput.manifest.requiredCapabilities as string[]) ?? [],
        environmentVariables:
          (mcpToolOutput.manifest.environmentVariables as Record<
            string,
            string
          >) ?? {},
        workingDirectory:
          (mcpToolOutput.manifest.workingDirectory as string) ?? '/tmp',
        maxRetries: (mcpToolOutput.manifest.maxRetries as number) ?? 0,
        retryDelay: (mcpToolOutput.manifest.retryDelay as number) ?? 5,
        rollbackScript: mcpToolOutput.manifest.rollbackScript as
          | string
          | undefined,
      },
      approvalId,
      priority: this.determinePriority(mcpToolOutput.manifest),
    };

    // Queue script for execution
    const status = await this.executionService.queueScriptExecution(request);

    // Track active execution
    this.activeExecutions.set(status.packageId, status);

    // Emit event for monitoring
    this.emit('script:queued', {
      packageId: status.packageId,
      sessionId,
      deviceId,
      status,
    });

    return status;
  }

  /**
   * Process execution results from device agent and report through SDK pipeline
   * @param result - Execution result from device
   * @param sessionId - Session ID for context
   * @returns SDK message for AI orchestrator
   */
  async processDeviceExecutionResult(
    result: ExecutionResult,
    sessionId: string
  ): Promise<SDKMessage> {
    // Process result through execution service
    const processedResult =
      await this.executionService.reportExecutionResult(result);

    // Update active executions
    if (this.activeExecutions.has(result.packageId)) {
      const status = this.activeExecutions.get(result.packageId);
      if (status) {
        status.status = result.exitCode === 0 ? 'completed' : 'failed';
        status.completedAt = result.completedAt;
        status.result = processedResult;
      }
    }

    // Format as SDK message for AI pipeline
    const sdkMessage = this.executionService.formatResultAsSDKMessage(
      processedResult,
      sessionId
    );

    // Emit events for monitoring
    this.emit('execution:completed', {
      packageId: result.packageId,
      sessionId,
      success: result.exitCode === 0,
      result: processedResult,
    });

    // Return SDK message for AI orchestrator to process
    return sdkMessage as SDKMessage;
  }

  /**
   * Stream execution status updates through SDK pipeline
   * @param packageId - Package ID to monitor
   * @param sessionId - Session ID for context
   */
  async *streamExecutionStatus(
    packageId: string,
    sessionId: string
  ): AsyncGenerator<SDKMessage, void> {
    let previousStatus: ExecutionStatus['status'] | null = null;

    while (true) {
      // Get current status
      const status = await this.executionService.getExecutionStatus(packageId);

      if (!status) {
        break;
      }

      // Emit update if status changed
      if (status.status !== previousStatus) {
        previousStatus = status.status;

        // Format status update as SDK message
        const statusMessage: Partial<SDKMessage> = {
          type: 'assistant' as const,
          session_id: sessionId,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: this.formatStatusMessage(status),
              },
            ],
          },
        };

        yield statusMessage as SDKMessage;
      }

      // Exit if execution completed
      if (status.status === 'completed' || status.status === 'failed') {
        // Yield final result if available
        if (status.result) {
          yield await this.processDeviceExecutionResult(
            status.result,
            sessionId
          );
        }
        break;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * Format status update message
   */
  private formatStatusMessage(status: ExecutionStatus): string {
    switch (status.status) {
      case 'queued':
        return `Script package ${status.packageId} is queued for execution on device ${status.deviceId}.${
          status.queuePosition ? ` Queue position: ${status.queuePosition}` : ''
        }`;
      case 'executing':
        return `Script is now executing on device ${status.deviceId}...`;
      case 'completed':
        return `Script execution completed successfully on device ${status.deviceId}.`;
      case 'failed':
        return `Script execution failed on device ${status.deviceId}.`;
      default:
        return `Script status: ${String(status.status)}`;
    }
  }

  /**
   * Determine execution priority based on manifest
   */
  private determinePriority(
    manifest: Record<string, unknown>
  ): 'low' | 'medium' | 'high' {
    // High priority for quick diagnostic commands
    if ((manifest.timeout as number) <= 10) {
      return 'high';
    }

    // Low priority for long-running or risky operations
    if (
      (manifest.timeout as number) > 300 ||
      manifest.rollbackScript ||
      (manifest.requiredCapabilities as string[])?.length > 0
    ) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Get all active executions for a session
   * @param sessionId - Session ID to filter by
   * @returns Array of active execution statuses
   */
  getActiveExecutions(_sessionId?: string): ExecutionStatus[] {
    const executions = Array.from(this.activeExecutions.values());

    // Note: ExecutionStatus doesn't have sessionId directly,
    // would need to track separately or add to status
    return executions;
  }

  /**
   * Cancel a queued or executing script
   * @param packageId - Package ID to cancel
   * @returns True if cancellation was successful
   */
  async cancelExecution(packageId: string): Promise<boolean> {
    const status = await this.executionService.getExecutionStatus(packageId);

    if (
      !status ||
      status.status === 'completed' ||
      status.status === 'failed'
    ) {
      return false;
    }

    // TODO: Implement cancellation logic
    // This would need to:
    // 1. Remove from Redis queue if still queued
    // 2. Send cancellation signal to device if executing
    // 3. Update database status

    this.emit('execution:cancelled', {
      packageId,
      status,
    });

    return true;
  }
}
