import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';
import { getRedisClient } from '@aizen/shared/utils/redis-client';

import { sanitizeString } from '../../utils/pii-sanitizer';
import { validateManifest } from '../schemas/manifest.schema';

import { ScriptPackagerService } from './script-packager.service';

import type { ScriptPackage, ExecutionResult } from './script-packager.service';
import type { ScriptManifest } from '../schemas/manifest.schema';
import type { SDKAssistantMessage } from '@anthropic-ai/claude-code';
import type { RedisClientType } from 'redis';

/**
 * Script execution request from AI orchestrator
 */
export interface ScriptExecutionRequest {
  sessionId: string;
  deviceId: string;
  script: string;
  manifest: ScriptManifest;
  approvalId?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Script execution status
 */
export interface ExecutionStatus {
  packageId: string;
  deviceId: string;
  status:
    | 'queued'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'cancellation_requested';
  queuePosition?: number;
  startedAt?: Date;
  completedAt?: Date;
  result?: ExecutionResult;
  error?: string;
}

/**
 * Database record interface for remediation scripts
 */
interface RemediationScriptRecord {
  id: string;
  session_id: string;
  device_id: string;
  script: string;
  manifest: ScriptManifest;
  checksum: string;
  signature: string | null;
  risk_level: string;
  status: string;
  approval_id: string | null;
  created_at: string;
  executed_at: string | null;
  execution_result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    completedAt: string;
    error?: string;
  } | null;
}

/**
 * Service for managing script execution workflow
 * Integrates AI orchestrator, script packager, and device agent
 */
export class ScriptExecutionService {
  private packager: ScriptPackagerService;
  private redis = getRedisClient();
  private redisClient: RedisClientType = getRedisClient().getClient();
  // Use admin client to avoid tight table-name typing while RLS is enforced at API levels
  private supabase = getSupabaseAdminClient();

  constructor() {
    this.packager = new ScriptPackagerService();
  }

  /**
   * Queue a script for execution on a device
   * @param request - Script execution request from AI orchestrator
   * @returns Execution status with package ID
   */
  async queueScriptExecution(
    request: ScriptExecutionRequest
  ): Promise<ExecutionStatus> {
    // Validate manifest
    const validatedManifest = validateManifest(request.manifest);

    // Package the script
    const scriptPackage = this.packager.packageScript(
      request.script,
      validatedManifest,
      request.approvalId
    );

    // Store package in database
    await this.storePackage(scriptPackage, request);

    // Queue for device execution
    await this.enqueueForDevice(
      scriptPackage,
      request.deviceId,
      request.priority
    );

    // Return initial status
    return {
      packageId: scriptPackage.id,
      deviceId: request.deviceId,
      status: 'queued',
      queuePosition: await this.getQueuePosition(
        request.deviceId,
        scriptPackage.id
      ),
    };
  }

  /**
   * Store script package in database
   */
  private async storePackage(
    scriptPackage: ScriptPackage,
    request: ScriptExecutionRequest
  ): Promise<void> {
    const { error } = await this.supabase.from('remediation_scripts').insert({
      id: scriptPackage.id,
      session_id: request.sessionId,
      device_id: request.deviceId,
      script: scriptPackage.script,
      manifest: scriptPackage.manifest,
      checksum: scriptPackage.checksum,
      signature: scriptPackage.signature ?? null,
      risk_level: this.calculateRiskLevel(scriptPackage.manifest),
      status: 'pending_execution',
      approval_id: request.approvalId ?? null,
    });

    if (error) {
      throw new Error(`Failed to store script package: ${error.message}`);
    }
  }

  /**
   * Enqueue package for device execution
   */
  private async enqueueForDevice(
    scriptPackage: ScriptPackage,
    deviceId: string,
    priority: string = 'medium'
  ): Promise<void> {
    const queueKey = `device:${deviceId}:script_queue`;
    const packageData = JSON.stringify({
      packageId: scriptPackage.id,
      priority,
      enqueuedAt: new Date().toISOString(),
    });

    let queueSuccess = false;
    let notifySuccess = false;

    // Add to device-specific queue
    try {
      if (priority === 'high') {
        await this.redisClient.lPush(queueKey, packageData);
      } else {
        await this.redisClient.rPush(queueKey, packageData);
      }
      queueSuccess = true;
    } catch (error) {
      console.error('Failed to queue script for device:', error);
    }

    // Notify device of new script
    try {
      await this.redis.publish(
        `device:${deviceId}:commands`,
        JSON.stringify({
          type: 'EXECUTE_SCRIPT',
          packageId: scriptPackage.id,
        })
      );
      notifySuccess = true;
    } catch (error) {
      console.error('Failed to notify device:', error);
    }

    // If both operations failed, update database and throw error
    if (!queueSuccess && !notifySuccess) {
      // Update database status to indicate queueing failure
      await this.supabase
        .from('remediation_scripts')
        .update({
          status: 'failed',
          execution_result: {
            error: 'Failed to queue script for device execution',
          },
        })
        .eq('id', scriptPackage.id);

      throw new Error(
        `Failed to queue script ${scriptPackage.id} for device ${deviceId}: Redis operations failed`
      );
    }
  }

  /**
   * Get queue position for a package
   *
   * NOTE: Performance consideration - This method has O(n) complexity as it:
   * 1. Fetches the entire queue from Redis (LRANGE 0 -1)
   * 2. Iterates through all items to find the package
   * 3. Parses JSON for each queue entry
   *
   * This is acceptable for small queues (<100 items) but should be optimized
   * for larger scale deployments. Potential optimizations:
   * - Use Redis LPOS command (Redis 6.0.6+) with consistent element format
   * - Maintain a separate position index in Redis hash
   * - Migrate to Redis Streams or sorted sets for built-in position tracking
   */
  private async getQueuePosition(
    deviceId: string,
    packageId: string
  ): Promise<number | undefined> {
    const queueKey = `device:${deviceId}:script_queue`;

    try {
      const queue = await this.redisClient.lRange(queueKey, 0, -1);

      const position = queue.findIndex(item => {
        try {
          const data = JSON.parse(item) as { packageId: string };
          return data.packageId === packageId;
        } catch {
          return false;
        }
      });

      return position >= 0 ? position + 1 : undefined;
    } catch (error) {
      console.error('Failed to get queue position:', error);
      return undefined;
    }
  }

  /**
   * Calculate risk level based on manifest
   */
  private calculateRiskLevel(
    manifest: ScriptManifest
  ): 'low' | 'medium' | 'high' {
    // High risk if requires dangerous capabilities
    const dangerousCapabilities = ['NET_ADMIN', 'SYS_ADMIN', 'SYS_BOOT'];
    if (
      manifest.requiredCapabilities?.some(cap =>
        dangerousCapabilities.includes(cap)
      )
    ) {
      return 'high';
    }

    // Medium risk if has rollback script or high timeout
    if (manifest.rollbackScript || manifest.timeout > 300) {
      return 'medium';
    }

    // Default to low risk
    return 'low';
  }

  /**
   * Retrieve a script package for device execution
   * @param packageId - Package ID to retrieve
   * @param deviceId - Device requesting the package
   * @returns Script package with verification
   */
  async getPackageForExecution(
    packageId: string,
    deviceId: string
  ): Promise<ScriptPackage | null> {
    // Get package from database
    const { data, error } = await this.supabase
      .from('remediation_scripts')
      .select('*')
      .eq('id', packageId)
      .eq('device_id', deviceId)
      .single();

    if (error || !data) {
      return null;
    }

    const record = data as RemediationScriptRecord;

    // Reconstruct package
    const scriptPackage: ScriptPackage = {
      id: record.id,
      script: record.script,
      manifest: record.manifest,
      checksum: record.checksum,
      signature: record.signature ?? undefined,
      createdAt: new Date(record.created_at),
      approvalId: record.approval_id ?? undefined,
      deviceId: record.device_id,
    };

    // Verify package integrity
    if (!this.packager.validateChecksum(scriptPackage)) {
      throw new Error('Package checksum validation failed');
    }

    // Verify signature if present
    if (scriptPackage.signature) {
      const isValid = this.packager.verifyPackage(scriptPackage);
      if (!isValid) {
        throw new Error('Package signature verification failed');
      }
    }

    // Update status to executing
    const { error: updateError } = await this.supabase
      .from('remediation_scripts')
      .update({
        status: 'executing',
        executed_at: new Date().toISOString(),
      })
      .eq('id', packageId);

    if (updateError) {
      throw new Error(
        `Failed to update script status to executing: ${updateError.message}`
      );
    }

    return scriptPackage;
  }

  /**
   * Report execution result from device
   * @param result - Execution result from device agent
   * @returns Processed result
   */
  async reportExecutionResult(
    result: ExecutionResult
  ): Promise<ExecutionResult> {
    // Process and sanitize result
    const processedResult = this.packager.processExecutionResult(result);

    // Update database
    const { error: updateError } = await this.supabase
      .from('remediation_scripts')
      .update({
        status: result.exitCode === 0 ? 'executed' : 'failed',
        execution_result: {
          exitCode: processedResult.exitCode,
          stdout: processedResult.stdout,
          stderr: processedResult.stderr,
          executionTime: processedResult.executionTime,
          completedAt: processedResult.completedAt.toISOString(),
          error: processedResult.error,
        },
      })
      .eq('id', result.packageId);

    if (updateError) {
      throw new Error(
        `Failed to update execution result: ${updateError.message}`
      );
    }

    // Notify AI orchestrator via Redis
    await this.redis.publish(
      `ai:execution_results`,
      JSON.stringify(processedResult)
    );

    return processedResult;
  }

  /**
   * Get execution status for a package
   * @param packageId - Package ID to check
   * @returns Current execution status
   */
  async getExecutionStatus(packageId: string): Promise<ExecutionStatus | null> {
    // Get package from database
    const { data, error } = await this.supabase
      .from('remediation_scripts')
      .select('*')
      .eq('id', packageId)
      .single();

    if (error || !data) {
      return null;
    }

    const record = data as RemediationScriptRecord;

    // Map database status to execution status
    const statusMap: Record<string, ExecutionStatus['status']> = {
      pending_validation: 'queued',
      validated: 'queued',
      approved: 'queued',
      rejected: 'failed',
      pending_execution: 'queued',
      executing: 'executing',
      executed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
      cancellation_requested: 'cancellation_requested',
    };

    const status: ExecutionStatus = {
      packageId: record.id,
      deviceId: record.device_id,
      status: statusMap[record.status] ?? 'queued',
    };

    // Add timing information
    if (record.executed_at) {
      status.startedAt = new Date(record.executed_at);
    }

    if (record.execution_result?.completedAt) {
      status.completedAt = new Date(record.execution_result.completedAt);
    }

    // Add result if available
    if (record.execution_result) {
      status.result = {
        packageId: record.id,
        deviceId: record.device_id,
        exitCode: record.execution_result.exitCode,
        stdout: record.execution_result.stdout,
        stderr: record.execution_result.stderr,
        executionTime: record.execution_result.executionTime,
        completedAt: new Date(record.execution_result.completedAt),
        error: record.execution_result.error,
      };
    }

    // Get queue position if still queued
    if (status.status === 'queued') {
      status.queuePosition = await this.getQueuePosition(
        record.device_id,
        record.id
      );
    }

    return status;
  }

  /**
   * Convert execution result to SDK message for AI orchestrator
   * @param result - Execution result
   * @returns Partial SDK message for reporting back
   */
  formatResultAsSDKMessage(
    result: ExecutionResult
  ): Pick<SDKAssistantMessage, 'message'> {
    // Maximum output size (100KB per output stream)
    const MAX_OUTPUT_SIZE = 100 * 1024;

    // Sanitize and truncate outputs
    const sanitizeAndTruncate = (output: string, maxSize: number): string => {
      // First sanitize for PII
      const sanitized = sanitizeString(output);

      // Then truncate if too large
      if (sanitized.length > maxSize) {
        const truncated = sanitized.substring(0, maxSize);
        return `${truncated}\n\n[Output truncated - exceeded ${maxSize} characters]`;
      }

      return sanitized;
    };

    const sanitizedStdout = sanitizeAndTruncate(
      result.stdout || '',
      MAX_OUTPUT_SIZE
    );
    const sanitizedStderr = sanitizeAndTruncate(
      result.stderr || '',
      MAX_OUTPUT_SIZE
    );

    const content =
      result.exitCode === 0
        ? `Script execution completed successfully on device ${result.deviceId}.\n\nOutput:\n${sanitizedStdout}`
        : `Script execution failed on device ${result.deviceId}.\n\nExit code: ${result.exitCode}\nError output:\n${sanitizedStderr}`;

    return {
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      },
    };
  }
}
