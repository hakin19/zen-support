/**
 * HITL Permission Handler Service
 * Handles human-in-the-loop approval workflows for Claude Code SDK
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { EventEmitter } from 'events';

import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { NetworkMCPTools } from '../tools/network-mcp-tools';

import type { WebSocketConnectionManager } from '../../services/websocket-connection-manager';
import type {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-code';

interface PendingApproval {
  id: string;
  sessionId: string;
  customerId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
  timestamp: number; // Unix timestamp in milliseconds
  timestampISO: string; // ISO-8601 string for DB consistency
  riskLevel: string; // Risk level for the tool operation
  reasoning?: string; // Optional reasoning for the request
  suggestions?: Array<{ toolName: string; input: unknown; reason: string }>;
}

interface ApprovalRequest {
  id: string;
  sessionId: string;
  customerId: string;
  toolName: string;
  input: Record<string, unknown>;
  riskLevel: string;
  reasoning?: string;
  timestamp: number; // Unix timestamp in milliseconds
  timestampISO: string; // ISO-8601 string for DB consistency
}

interface ApprovalPolicy {
  id: string;
  customerId: string;
  toolName: string;
  autoApprove: boolean;
  requiresApproval: boolean;
  riskThreshold: string;
  conditions?: Record<string, unknown>;
}

export class HITLPermissionHandler extends EventEmitter {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private approvalPolicies: Map<string, ApprovalPolicy[]> = new Map();
  private connectionManager: WebSocketConnectionManager | null = null;
  private defaultTimeout = 300000; // 5 minutes
  private sessionCustomerMap: Map<string, string> = new Map();

  constructor(connectionManager?: WebSocketConnectionManager) {
    super();
    this.connectionManager = connectionManager || null;
  }

  /**
   * Helper to ensure consistent timestamp handling
   * @returns Object with both timestamp formats
   */
  private getTimestamps(): { timestamp: number; timestampISO: string } {
    const timestamp = Date.now();
    const timestampISO = new Date(timestamp).toISOString();
    return { timestamp, timestampISO };
  }

  /**
   * Set the WebSocket connection manager
   */
  setConnectionManager(manager: WebSocketConnectionManager): void {
    this.connectionManager = manager;
  }

  /**
   * Create a canUseTool handler for a specific session
   * This binds the sessionId and customerId to the SDK-compatible handler
   */
  createCanUseToolHandler(sessionId: string, customerId: string): CanUseTool {
    // Store the mapping for later retrieval
    this.sessionCustomerMap.set(sessionId, customerId);

    // Return SDK-compatible CanUseTool handler
    return async (
      toolName: string,
      input: unknown,
      options: {
        signal?: AbortSignal;
        suggestions?: Array<{
          toolName: string;
          input: unknown;
          reason: string;
        }>;
      }
    ): Promise<PermissionResult> => {
      return this.handleToolPermission(
        sessionId,
        customerId,
        toolName,
        input as Record<string, unknown>,
        options
      );
    };
  }

  /**
   * Internal handler for tool permissions with session context
   */
  private async handleToolPermission(
    sessionId: string,
    customerId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal?: AbortSignal;
      suggestions?: Array<{ toolName: string; input: unknown; reason: string }>;
    } = {}
  ): Promise<PermissionResult> {
    // Load policies for customer if not cached
    if (!this.approvalPolicies.has(customerId)) {
      await this.loadPolicies(customerId);
    }

    const policies = this.approvalPolicies.get(customerId) || [];
    const toolPolicy = policies.find(p => p.toolName === toolName);

    // Check for auto-approval
    if (toolPolicy?.autoApprove) {
      return {
        behavior: 'allow' as const,
        updatedInput: input,
      };
    }

    // Check if approval is required
    if (!toolPolicy?.requiresApproval) {
      // Default to requiring approval for unknown tools
      if (!toolPolicy) {
        console.warn(
          `No policy found for tool ${toolName}, defaulting to require approval`
        );
      }
    }

    // For network diagnostic tools, check if they're read-only
    const networkTools = new NetworkMCPTools();
    const isReadOnlyTool = await networkTools.isReadOnlyTool(toolName);

    if (isReadOnlyTool) {
      return {
        behavior: 'allow' as const,
        updatedInput: input,
      };
    }

    // Check if suggestions are provided as an alternative
    if (options.suggestions && options.suggestions.length > 0) {
      // Process suggestions and return them for user choice
      return {
        behavior: 'suggestions' as const,
        suggestions: options.suggestions,
      };
    }

    // Require human approval
    return this.requestApproval(
      sessionId,
      customerId,
      toolName,
      input,
      options
    );
  }

  /**
   * Request human approval for tool usage
   */
  private async requestApproval(
    sessionId: string,
    customerId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: {
      timeout?: number;
      riskLevel?: string;
      reasoning?: string;
      signal?: AbortSignal;
      suggestions?: Array<{ toolName: string; input: unknown; reason: string }>;
    }
  ): Promise<PermissionResult> {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const timeout = options.timeout || this.defaultTimeout;

    return new Promise<PermissionResult>((resolve, reject) => {
      // Check if already aborted
      if (options.signal?.aborted) {
        reject(new Error('Request aborted'));
        return;
      }

      const timeoutHandle = setTimeout(async () => {
        // Update database status to 'timeout' before rejecting
        try {
          await this.updateApprovalStatus(
            approvalId,
            'timeout',
            `Request timed out after ${timeout / 1000} seconds`
          );
        } catch (error) {
          console.error('[HITL] Failed to update timeout status:', {
            approvalId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Continue with cleanup even if database update fails
        }

        // Clean up and reject
        this.pendingApprovals.delete(approvalId);

        // Emit timeout event for monitoring
        this.emit('approval_timeout', {
          approvalId,
          sessionId,
          customerId,
          toolName,
          timeout,
        });

        reject(new Error('Approval request timed out'));
      }, timeout);

      // Handle abort signal
      const abortHandler = () => {
        clearTimeout(timeoutHandle);
        this.pendingApprovals.delete(approvalId);
        reject(new Error('Request aborted by client'));
      };

      if (options.signal) {
        options.signal.addEventListener('abort', abortHandler);
      }

      const timestamps = this.getTimestamps();
      const pending: PendingApproval = {
        id: approvalId,
        sessionId,
        customerId,
        toolName,
        input,
        resolve: (result: PermissionResult) => {
          // Clean up abort listener when resolving
          if (options.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
          resolve(result);
        },
        reject: (error: Error) => {
          // Clean up abort listener when rejecting
          if (options.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
          reject(error);
        },
        timeout: timeoutHandle,
        timestamp: timestamps.timestamp,
        timestampISO: timestamps.timestampISO,
        riskLevel: options.riskLevel || 'medium',
        reasoning: options.reasoning,
        suggestions: options.suggestions,
      };

      this.pendingApprovals.set(approvalId, pending);

      // Send approval request to WebSocket clients
      void this.broadcastApprovalRequest({
        id: approvalId,
        sessionId,
        customerId,
        toolName,
        input,
        riskLevel: pending.riskLevel,
        reasoning: pending.reasoning,
        timestamp: pending.timestamp,
        timestampISO: pending.timestampISO, // Include ISO timestamp for client consistency
      });

      // Audit the approval request
      this.auditApprovalRequest(
        approvalId,
        sessionId,
        customerId,
        toolName,
        input,
        options.riskLevel
      ).catch(error => {
        // Clean up on audit failure
        if (pending.timeout) clearTimeout(pending.timeout);
        this.pendingApprovals.delete(approvalId);
        reject(new Error(`Failed to audit approval request: ${error.message}`));
      });
    });
  }

  /**
   * Handle approval response from human operator
   */
  async handleApprovalResponse(
    approvalId: string,
    decision: 'approved' | 'denied' | 'modify' | 'deny',
    options: {
      reason?: string;
      conditions?: Record<string, unknown>;
      modifiedInput?: Record<string, unknown>;
      interrupt?: boolean;
    } = {}
  ): Promise<void> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Remove from pending
    this.pendingApprovals.delete(approvalId);

    try {
      // Update audit record
      await this.updateApprovalStatus(approvalId, decision, options.reason);

      // Resolve with proper PermissionResult
      if (decision === 'approved' || decision === 'modify') {
        pending.resolve({
          behavior: 'allow' as const,
          updatedInput: options.modifiedInput || pending.input,
          updatedPermissions: options.conditions,
        });
      } else {
        pending.resolve({
          behavior: 'deny' as const,
          message: options.reason || 'Request denied by operator',
          interrupt: options.interrupt,
        });
      }

      // Emit event for monitoring
      this.emit('approval_response', {
        approvalId,
        decision,
        toolName: pending.toolName,
        sessionId: pending.sessionId,
        customerId: pending.customerId,
        ...options,
      });
    } catch (error) {
      pending.reject(
        new Error(
          `Failed to process approval: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Get pending approval requests for a customer
   */
  getPendingApprovals(customerId: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(approval => approval.customerId === customerId)
      .map(approval => ({
        id: approval.id,
        sessionId: approval.sessionId,
        customerId: approval.customerId,
        toolName: approval.toolName,
        input: approval.input,
        riskLevel: approval.riskLevel, // Use actual risk level from pending approval
        reasoning: approval.reasoning,
        timestamp: approval.timestamp,
        timestampISO: approval.timestampISO, // Include ISO timestamp for consistency
      }));
  }

  /**
   * Cancel pending approval request
   */
  cancelApproval(approvalId: string, reason = 'Cancelled by system'): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      if (pending.timeout) clearTimeout(pending.timeout);
      this.pendingApprovals.delete(approvalId);
      pending.resolve({
        behavior: 'deny' as const,
        message: reason,
      });
    }
  }

  /**
   * Register WebSocket client for approval notifications (deprecated - use connection manager)
   */
  registerWebSocketClient(_sessionId: string, _ws: unknown): void {
    // This method is kept for backward compatibility but functionality
    // is now handled through the WebSocketConnectionManager
    console.warn(
      'registerWebSocketClient is deprecated, use WebSocketConnectionManager'
    );
  }

  /**
   * Load approval policies for a customer
   */
  async loadPolicies(customerId: string): Promise<void> {
    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('approval_policies')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to load approval policies:', error);
      return;
    }

    const policies: ApprovalPolicy[] = (data || []).map((row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      // Migration 2025091500003 ensures tool_name column exists
      toolName: row.tool_name,
      autoApprove: row.auto_approve || false,
      requiresApproval: row.requires_approval ?? true,
      riskThreshold: row.risk_threshold || 'medium',
      conditions: row.conditions,
    }));

    this.approvalPolicies.set(customerId, policies);
  }

  /**
   * Add or update approval policy
   */
  async updatePolicy(
    customerId: string,
    toolName: string,
    policy: Partial<ApprovalPolicy>
  ): Promise<void> {
    const supabase = getSupabaseAdminClient() as any;

    // Migration 2025091500003 ensures these columns exist
    const policyData = {
      customer_id: customerId,
      tool_name: toolName, // Migration adds tool_name column
      auto_approve: policy.autoApprove || false,
      requires_approval: policy.requiresApproval ?? true,
      risk_threshold: policy.riskThreshold || 'medium',
      conditions: policy.conditions || {},
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('approval_policies')
      .upsert(policyData, {
        onConflict: 'customer_id,tool_name', // Migration adds unique constraint on these columns
      });

    if (error) {
      throw new Error(`Failed to update policy: ${error.message}`);
    }

    // Reload policies
    await this.loadPolicies(customerId);
  }

  /**
   * Get tool usage statistics for monitoring
   */
  async getToolUsageStats(
    customerId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<
    {
      toolName: string;
      totalRequests: number;
      approvedRequests: number;
      deniedRequests: number;
      averageResponseTime: number;
    }[]
  > {
    const supabase = getSupabaseAdminClient() as any;

    const { data, error } = await supabase
      .from('approval_requests')
      .select('tool_name, status, created_at, updated_at')
      .eq('customer_id', customerId)
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());

    if (error) {
      throw new Error(`Failed to get tool usage stats: ${error.message}`);
    }

    const stats = new Map<
      string,
      {
        total: number;
        approved: number;
        denied: number;
        responseTimes: number[];
      }
    >();

    for (const request of data as any[]) {
      const toolName = request.tool_name;
      if (!stats.has(toolName)) {
        stats.set(toolName, {
          total: 0,
          approved: 0,
          denied: 0,
          responseTimes: [],
        });
      }

      const stat = stats.get(toolName)!;
      stat.total++;

      if (request.status === 'approved') {
        stat.approved++;
      } else if (request.status === 'denied') {
        stat.denied++;
      }

      if (request.updated_at && request.created_at) {
        const responseTime =
          new Date(request.updated_at).getTime() -
          new Date(request.created_at).getTime();
        stat.responseTimes.push(responseTime);
      }
    }

    return Array.from(stats.entries()).map(([toolName, stat]) => ({
      toolName,
      totalRequests: stat.total,
      approvedRequests: stat.approved,
      deniedRequests: stat.denied,
      averageResponseTime:
        stat.responseTimes.length > 0
          ? stat.responseTimes.reduce((a, b) => a + b, 0) /
            stat.responseTimes.length
          : 0,
    }));
  }

  /**
   * Handle permission update from SDK
   */
  onPermissionUpdate(callback: (update: PermissionUpdate) => void): void {
    this.on('permission_update', callback);
  }

  /**
   * Broadcast approval request to WebSocket clients
   */
  private async broadcastApprovalRequest(request: any): Promise<void> {
    if (!this.connectionManager) {
      console.warn(
        'No WebSocket connection manager available for broadcasting'
      );
      return;
    }

    const message = {
      type: 'approval_request',
      ...request,
    };

    // Broadcast to all approval connections and customer connections
    const approvalConnections =
      this.connectionManager.getConnectionsByType('approval');
    const customerConnections =
      this.connectionManager.getConnectionsByType('customer');

    // Also get web-portal connections for the specific customer
    const webPortalConnections = this.connectionManager
      .getConnectionsByType('web-portal')
      .filter(conn => conn.metadata?.customerId === request.customerId);

    const allConnections = [
      ...approvalConnections,
      ...customerConnections.filter(
        conn => conn.metadata?.customerId === request.customerId
      ),
      ...webPortalConnections,
    ];

    const promises = allConnections.map(conn =>
      this.connectionManager!.sendToConnection(conn.id, message)
    );

    await Promise.all(promises);
  }

  /**
   * Audit approval request to database
   * @throws Error if database operation fails
   */
  private async auditApprovalRequest(
    approvalId: string,
    sessionId: string,
    customerId: string,
    toolName: string,
    input: Record<string, unknown>,
    riskLevel?: string
  ): Promise<void> {
    try {
      const supabase = getSupabaseAdminClient() as any;
      const { error } = await supabase.from('approval_requests').insert({
        id: approvalId,
        session_id: sessionId,
        customer_id: customerId,
        tool_name: toolName,
        tool_input: input as any,
        status: 'pending',
        risk_level: riskLevel || 'medium',
        created_at: new Date().toISOString(), // RFC3339/ISO-8601 for TIMESTAMPTZ
      } as any);

      if (error) {
        console.error('[HITL] Failed to audit approval request:', {
          approvalId,
          sessionId,
          error: error.message,
          code: error.code,
        });
        throw new Error(
          `Failed to audit approval request: ${error.message || 'Database error'}`
        );
      }
    } catch (error) {
      // Log the error with context
      console.error('[HITL] Audit request failed:', {
        approvalId,
        sessionId,
        toolName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Re-throw to let caller handle
      throw error;
    }
  }

  /**
   * Update approval status in database
   * @throws Error if database operation fails
   */
  private async updateApprovalStatus(
    approvalId: string,
    status: 'approved' | 'denied' | 'modify' | 'deny' | 'timeout',
    reason?: string
  ): Promise<void> {
    try {
      const supabase = getSupabaseAdminClient() as any;

      // Map status values to valid database enum values
      let dbStatus: 'approved' | 'denied' | 'timeout';
      if (status === 'modify') {
        dbStatus = 'approved'; // 'modify' is treated as approved with modifications
      } else if (status === 'deny') {
        dbStatus = 'denied'; // Map 'deny' to 'denied' for DB constraint
      } else {
        dbStatus = status;
      }

      const updateData: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(), // RFC3339/ISO-8601 for TIMESTAMPTZ
      };

      // Add reason if provided
      if (reason) {
        updateData.decision_reason = reason;
      }

      // Set decided_at for final statuses (using mapped dbStatus)
      if (['approved', 'denied', 'timeout'].includes(dbStatus)) {
        updateData.decided_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('approval_requests')
        .update(updateData)
        .eq('id', approvalId);

      if (error) {
        console.error('[HITL] Failed to update approval status:', {
          approvalId,
          status,
          error: error.message,
          code: error.code,
        });
        throw new Error(
          `Failed to update approval status: ${error.message || 'Database error'}`
        );
      }
    } catch (error) {
      // Log the error with context
      console.error('[HITL] Status update failed:', {
        approvalId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Re-throw to let caller handle
      throw error;
    }
  }

  /**
   * Get approval request history for a session
   */
  async getApprovalHistory(sessionId: string): Promise<ApprovalRequest[]> {
    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get approval history: ${error.message}`);
    }

    return (data as any[]).map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      customerId: row.customer_id,
      toolName: row.tool_name,
      input: row.tool_input,
      riskLevel: row.risk_level,
      reasoning: row.reason,
      timestamp: new Date(row.created_at).getTime(),
    }));
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Clear pending approvals
    for (const pending of this.pendingApprovals.values()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new Error('Service shutting down'));
    }

    // Clear maps
    this.pendingApprovals.clear();
    this.approvalPolicies.clear();
    this.sessionCustomerMap.clear();

    // Remove listeners
    this.removeAllListeners();
  }

  /**
   * SDK-compatible canUseTool implementation
   * Use this directly with Claude Code SDK when you don't have session context
   */
  canUseTool: CanUseTool = async (
    toolName: string,
    input: unknown,
    options: {
      signal?: AbortSignal;
      suggestions?: Array<{ toolName: string; input: unknown; reason: string }>;
    }
  ): Promise<PermissionResult> => {
    // For SDK compatibility without session context, use defaults
    // In production, you should get these from the request context
    const sessionId = 'default-session';
    const customerId = 'default-customer';

    return this.handleToolPermission(
      sessionId,
      customerId,
      toolName,
      input as Record<string, unknown>,
      options
    );
  };
}
