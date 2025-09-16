import { EventEmitter } from 'events';

import { getSupabase } from '@aizen/shared';
import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { ScriptExecutionService } from './script-execution.service';

import type {
  ScriptExecutionRequest,
  ExecutionStatus,
} from './script-execution.service';
import type { ExecutionResult } from './script-packager.service';
import type {
  SDKMessage,
  SDKAssistantMessage,
} from '@anthropic-ai/claude-code';

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
  ): Promise<SDKAssistantMessage> {
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
    const sdkMessage =
      this.executionService.formatResultAsSDKMessage(processedResult);

    // Emit events for monitoring
    this.emit('execution:completed', {
      packageId: result.packageId,
      sessionId,
      success: result.exitCode === 0,
      result: processedResult,
    });

    // Build properly typed SDKAssistantMessage
    const assistantMessage: SDKAssistantMessage = {
      type: 'assistant',
      session_id: sessionId,
      message: sdkMessage.message,
      parent_tool_use_id: null,
    };

    return assistantMessage;
  }

  /**
   * Stream execution status updates through SDK pipeline
   * @param packageId - Package ID to monitor
   * @param sessionId - Session ID for context
   * @param options - Streaming options including abort signal and timeout
   */
  async *streamExecutionStatus(
    packageId: string,
    sessionId: string,
    options?: {
      // eslint-disable-next-line no-undef
      abortSignal?: AbortSignal;
      maxDuration?: number; // milliseconds
      pollInterval?: number; // milliseconds
    }
  ): AsyncGenerator<SDKMessage, void> {
    const startTime = Date.now();
    const maxDuration = options?.maxDuration ?? 600000; // Default 10 minutes
    const pollInterval = options?.pollInterval ?? 2000; // Default 2 seconds
    const abortSignal = options?.abortSignal;

    let previousStatus: ExecutionStatus['status'] | null = null;
    let backoffMultiplier = 1;

    while (true) {
      // Check abort signal
      if (abortSignal?.aborted) {
        break;
      }

      // Check timeout
      if (Date.now() - startTime > maxDuration) {
        const timeoutMessage: SDKAssistantMessage = {
          type: 'assistant',
          session_id: sessionId,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: `Execution monitoring timed out after ${maxDuration / 1000} seconds. The script may still be running on the device.`,
              },
            ],
          },
          parent_tool_use_id: null,
        };
        yield timeoutMessage;
        break;
      }

      // Get current status
      const status = await this.executionService.getExecutionStatus(packageId);

      if (!status) {
        break;
      }

      // Emit update if status changed
      if (status.status !== previousStatus) {
        previousStatus = status.status;
        backoffMultiplier = 1; // Reset backoff on status change

        // Format status update as properly typed SDK message
        const statusMessage: SDKAssistantMessage = {
          type: 'assistant',
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
          parent_tool_use_id: null,
        };

        yield statusMessage;
      } else {
        // Implement exponential backoff if no status change
        backoffMultiplier = Math.min(backoffMultiplier * 1.5, 10);
      }

      // Exit if execution completed
      if (
        status.status === 'completed' ||
        status.status === 'failed' ||
        status.status === 'cancelled'
      ) {
        // Yield final result if available
        if (status.result) {
          yield await this.processDeviceExecutionResult(
            status.result,
            sessionId
          );
        }
        break;
      }

      // Wait before next check with backoff
      const waitTime = pollInterval * backoffMultiplier;
      await new Promise(resolve => setTimeout(resolve, waitTime));
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

    const redis = getRedisClient();
    const redisClient = redis.getClient();
    const supabase = getSupabase();

    const now = new Date().toISOString();
    let immediatelyCancelled = false;

    // 1. Remove from Redis queue if still queued - can cancel immediately
    if (status.status === 'queued') {
      const queueKey = `device:${status.deviceId}:script_queue`;
      try {
        const queue = await redisClient.lRange(queueKey, 0, -1);

        // Find and remove the package from queue
        for (let i = 0; i < queue.length; i++) {
          try {
            const item = queue[i];
            if (!item) continue;
            const data = JSON.parse(item) as { packageId: string };
            if (data.packageId === packageId) {
              // Remove the item at position i
              await redisClient.lRem(queueKey, 1, item);
              immediatelyCancelled = true;
              break;
            }
          } catch {
            // Skip invalid queue items
          }
        }
      } catch (error) {
        console.error('Failed to remove from queue:', error);
      }
    }

    // 2. Handle cancellation based on current state
    if (immediatelyCancelled) {
      // Queued items can be cancelled immediately
      const { error } = await supabase
        .from('remediation_scripts')
        .update({
          status: 'cancelled',
          cancellation_requested_at: now,
          cancellation_confirmed_at: now,
          cancellation_reason: 'user_requested_queue_removal',
          execution_result: {
            error: 'Execution cancelled by user (removed from queue)',
            completedAt: now,
          },
        })
        .eq('id', packageId);

      if (error) {
        console.error('Failed to update cancellation status:', error);
        return false;
      }

      this.emit('execution:cancelled', {
        packageId,
        status,
        immediate: true,
      });

      return true;
    } else if (status.status === 'executing') {
      // Executing scripts need two-phase cancellation
      // Phase 1: Mark as cancellation_requested and notify device
      const { error: updateError } = await supabase
        .from('remediation_scripts')
        .update({
          status: 'cancellation_requested',
          cancellation_requested_at: now,
          cancellation_reason: 'user_requested',
        })
        .eq('id', packageId);

      if (updateError) {
        console.error('Failed to mark cancellation requested:', updateError);
        return false;
      }

      // Send cancellation signal to device
      try {
        await redis.publish(
          `device:${status.deviceId}:commands`,
          JSON.stringify({
            type: 'CANCEL_EXECUTION',
            packageId,
            requestedAt: now,
          })
        );

        this.emit('execution:cancellation_requested', {
          packageId,
          status,
          requestedAt: now,
        });

        // Start timeout for forced cancellation if no ACK
        this.startCancellationTimeout(packageId, status.deviceId);

        return true;
      } catch (error) {
        console.error('Failed to send cancellation signal:', error);
        // Even if publish fails, we've marked it as requested
        return true;
      }
    }

    return false;
  }

  /**
   * Start a timeout to force cancellation if device doesn't acknowledge
   */
  private startCancellationTimeout(packageId: string, deviceId: string): void {
    const CANCELLATION_TIMEOUT_MS = 30000; // 30 seconds

    setTimeout((): void => {
      void (async (): Promise<void> => {
        const supabase = getSupabase();

        // Check if still in cancellation_requested state
        const { data, error } = await supabase
          .from('remediation_scripts')
          .select('status')
          .eq('id', packageId)
          .single();

        if (!error && data?.status === 'cancellation_requested') {
          // Force cancellation after timeout
          await supabase
            .from('remediation_scripts')
            .update({
              status: 'cancelled',
              cancellation_confirmed_at: new Date().toISOString(),
              cancellation_reason: 'timeout_no_device_ack',
              execution_result: {
                error:
                  'Execution cancelled by timeout (device did not acknowledge)',
                completedAt: new Date().toISOString(),
              },
            })
            .eq('id', packageId);

          this.emit('execution:cancelled', {
            packageId,
            deviceId,
            reason: 'timeout',
          });
        }
      })();
    }, CANCELLATION_TIMEOUT_MS);
  }

  /**
   * Handle cancellation acknowledgment from device
   */
  async handleCancellationAck(
    packageId: string,
    deviceId: string
  ): Promise<boolean> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Update to cancelled state after device acknowledgment
    const { error } = await supabase
      .from('remediation_scripts')
      .update({
        status: 'cancelled',
        cancellation_confirmed_at: now,
        execution_result: {
          error: 'Execution cancelled by user (confirmed by device)',
          completedAt: now,
        },
      })
      .eq('id', packageId)
      .eq('status', 'cancellation_requested');

    if (!error) {
      this.emit('execution:cancelled', {
        packageId,
        deviceId,
        confirmedByDevice: true,
      });
    }

    return !error;
  }
}
