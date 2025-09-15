/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-base-to-string */

import { EventEmitter } from 'events';

import WebSocket from 'ws';

import { getSupabase } from '@aizen/shared';

import { ToolRegistry } from '../tools/network-mcp-tools';

import type {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-code';

interface PendingApproval {
  id: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: Date;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface ApprovalPolicy {
  id: string;
  customerId: string;
  toolPattern: string;
  action: 'allow' | 'deny' | 'ask';
  conditions?: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * Human-in-the-Loop Permission Handler Service
 * Manages tool approval workflows for the Claude Code SDK
 */
export class HITLPermissionHandler extends EventEmitter {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private approvalPolicies: Map<string, ApprovalPolicy[]> = new Map();
  private wsClients: Map<string, WebSocket> = new Map();
  private defaultTimeout = 300000; // 5 minutes

  constructor() {
    super();
  }

  /**
   * Create a canUseTool handler for a specific session
   */
  createCanUseToolHandler(
    sessionId: string,
    customerId: string,
    options?: {
      timeout?: number;
      autoApprove?: string[];
      autoDeny?: string[];
    }
  ): CanUseTool {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      {
        signal,
        suggestions,
      }: { signal: globalThis.globalThis.AbortSignal; suggestions?: any }
    ): Promise<PermissionResult> => {
      // Check abort signal
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      // Check auto-approve list
      if (options?.autoApprove?.includes(toolName)) {
        return this.createAllowResult(input, suggestions);
      }

      // Check auto-deny list
      if (options?.autoDeny?.includes(toolName)) {
        return this.createDenyResult(`Tool ${toolName} is not allowed`);
      }

      // Check policies
      const policy = await this.checkPolicies(customerId, toolName, input);
      if (policy) {
        if (policy.action === 'allow') {
          return this.createAllowResult(input, suggestions);
        } else if (policy.action === 'deny') {
          return this.createDenyResult(`Tool ${toolName} denied by policy`);
        }
      }

      // Get tool risk level
      const riskLevel = ToolRegistry.getToolRiskLevel(toolName);

      // Auto-approve low-risk read-only tools
      if (riskLevel === 'low' && this.isReadOnlyTool(toolName)) {
        return this.createAllowResult(input, suggestions);
      }

      // Request human approval for medium/high risk tools
      return this.requestHumanApproval(sessionId, customerId, toolName, input, {
        signal,
        suggestions,
        timeout: options?.timeout || this.defaultTimeout,
        riskLevel,
      });
    };
  }

  /**
   * Request human approval through WebSocket
   */
  private async requestHumanApproval(
    sessionId: string,
    customerId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: globalThis.AbortSignal;
      suggestions?: PermissionUpdate[];
      timeout: number;
      riskLevel: string;
    }
  ): Promise<PermissionResult> {
    const approvalId = this.generateApprovalId();

    return new Promise((resolve, reject) => {
      // Create pending approval
      const pending: PendingApproval = {
        id: approvalId,
        sessionId,
        toolName,
        input,
        timestamp: new Date(),
        resolve,
        reject,
      };

      // Set timeout
      pending.timeout = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        reject(new Error('Approval request timed out'));
      }, options.timeout);

      // Store pending approval
      this.pendingApprovals.set(approvalId, pending);

      // Handle abort signal
      options.signal.addEventListener('abort', () => {
        if (pending.timeout) clearTimeout(pending.timeout);
        this.pendingApprovals.delete(approvalId);
        reject(new Error('Operation aborted'));
      });

      // Send approval request to WebSocket clients
      this.broadcastApprovalRequest({
        id: approvalId,
        sessionId,
        customerId,
        toolName,
        input,
        riskLevel: options.riskLevel,
        suggestions: options.suggestions,
        timestamp: pending.timestamp,
      });

      // Store in database for audit (critical for compliance)
      this.storeApprovalRequest(
        approvalId,
        sessionId,
        customerId,
        toolName,
        input
      ).catch(error => {
        // Clean up on audit failure
        if (pending.timeout) clearTimeout(pending.timeout);
        this.pendingApprovals.delete(approvalId);

        // Reject the approval request if we can't audit it
        const auditError = new Error(
          `Failed to store approval audit: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        reject(auditError);

        // Log for monitoring
        console.error('Failed to store approval request for audit:', {
          approvalId,
          sessionId,
          toolName,
          error,
        });
      });

      // Emit event for other systems
      this.emit('approval:requested', {
        id: approvalId,
        sessionId,
        toolName,
        input,
      });
    });
  }

  /**
   * Handle approval response from user
   */
  async handleApprovalResponse(
    approvalId: string,
    decision: 'approve' | 'deny' | 'modify',
    options?: {
      modifiedInput?: Record<string, unknown>;
      reason?: string;
      alwaysAllow?: boolean;
      interrupt?: boolean;
    }
  ): Promise<void> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error('Approval request not found or expired');
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Remove from pending
    this.pendingApprovals.delete(approvalId);

    // Create result based on decision
    let result: PermissionResult;

    switch (decision) {
      case 'approve':
        result = this.createAllowResult(
          options?.modifiedInput || pending.input,
          options?.alwaysAllow
            ? this.createPermissionUpdate(pending.toolName)
            : undefined
        );
        break;

      case 'modify':
        if (!options?.modifiedInput) {
          throw new Error('Modified input required for modify decision');
        }
        result = this.createAllowResult(
          options.modifiedInput,
          options?.alwaysAllow
            ? this.createPermissionUpdate(pending.toolName)
            : undefined
        );
        break;

      case 'deny':
        result = this.createDenyResult(
          options?.reason || 'Request denied by user',
          options?.interrupt
        );
        break;
    }

    // Store decision in database
    await this.storeApprovalDecision(approvalId, decision, options?.reason);

    // Emit event
    this.emit('approval:decided', {
      id: approvalId,
      sessionId: pending.sessionId,
      toolName: pending.toolName,
      decision,
    });

    // Resolve the promise
    pending.resolve(result);
  }

  /**
   * Register WebSocket client for approval notifications
   */
  registerWebSocketClient(sessionId: string, ws: WebSocket): void {
    this.wsClients.set(sessionId, ws);

    ws.on('close', () => {
      this.wsClients.delete(sessionId);
    });

    ws.on('message', async data => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'approval_response') {
          await this.handleApprovalResponse(
            message.approvalId,
            message.decision,
            message.options
          );
        }
      } catch (error) {
        console.error('Failed to handle WebSocket message:', error);
      }
    });
  }

  /**
   * Load approval policies from database
   */
  async loadPolicies(customerId: string): Promise<void> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('approval_policies')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to load approval policies:', error);
      return;
    }

    const policies = (data || []).map(row => ({
      id: row.id,
      customerId: row.customer_id,
      toolPattern: row.tool_pattern,
      action: row.action as 'allow' | 'deny' | 'ask',
      conditions: row.conditions as Record<string, unknown> | undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    }));

    this.approvalPolicies.set(customerId, policies);
  }

  /**
   * Check policies for tool usage
   */
  private async checkPolicies(
    customerId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ApprovalPolicy | null> {
    // Load policies if not cached
    if (!this.approvalPolicies.has(customerId)) {
      await this.loadPolicies(customerId);
    }

    const policies = this.approvalPolicies.get(customerId) || [];

    // Find matching policy
    for (const policy of policies) {
      // Check if expired
      if (policy.expiresAt && policy.expiresAt < new Date()) {
        continue;
      }

      // Check tool pattern match
      if (this.matchesPattern(toolName, policy.toolPattern)) {
        // Check conditions if any
        if (
          policy.conditions &&
          !this.checkConditions(input, policy.conditions)
        ) {
          continue;
        }

        return policy;
      }
    }

    return null;
  }

  /**
   * Check if tool name matches pattern
   */
  private matchesPattern(toolName: string, pattern: string): boolean {
    // Convert pattern to regex (support wildcards)
    const regex = new RegExp(
      `^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`
    );
    return regex.test(toolName);
  }

  /**
   * Check if input meets policy conditions
   */
  private checkConditions(
    input: Record<string, unknown>,
    conditions: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (input[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if tool is read-only
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = [
      'Read',
      'Glob',
      'Grep',
      'ListMcpResourcesTool',
      'ReadMcpResourceTool',
      'ping_test',
      'dns_lookup',
      'interface_status',
    ];
    return readOnlyTools.includes(toolName);
  }

  /**
   * Create allow result
   */
  private createAllowResult(
    updatedInput: Record<string, unknown>,
    updatedPermissions?: PermissionUpdate[]
  ): PermissionResult {
    return {
      behavior: 'allow',
      updatedInput,
      updatedPermissions,
    };
  }

  /**
   * Create deny result
   */
  private createDenyResult(
    message: string,
    interrupt?: boolean
  ): PermissionResult {
    return {
      behavior: 'deny',
      message,
      interrupt,
    };
  }

  /**
   * Create permission update for "always allow"
   */
  private createPermissionUpdate(toolName: string): PermissionUpdate[] {
    return [
      {
        type: 'addRules',
        rules: [
          {
            toolName,
            ruleContent: undefined,
          },
        ],
        behavior: 'allow',
        destination: 'session',
      },
    ];
  }

  /**
   * Broadcast approval request to WebSocket clients
   */
  private broadcastApprovalRequest(request: any): void {
    const message = JSON.stringify({
      type: 'approval_request',
      ...request,
    });

    for (const ws of this.wsClients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Store approval request in database
   */
  private async storeApprovalRequest(
    approvalId: string,
    sessionId: string,
    customerId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<void> {
    const supabase = getSupabase();
    await supabase.from('approval_requests').insert({
      id: approvalId,
      session_id: sessionId,
      customer_id: customerId,
      tool_name: toolName,
      tool_input: input,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Store approval decision in database
   */
  private async storeApprovalDecision(
    approvalId: string,
    decision: string,
    reason?: string
  ): Promise<void> {
    const supabase = getSupabase();
    await supabase
      .from('approval_requests')
      .update({
        status: decision,
        decision_reason: reason,
        decided_at: new Date().toISOString(),
      })
      .eq('id', approvalId);
  }

  /**
   * Generate unique approval ID
   */
  private generateApprovalId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get pending approvals for a session
   */
  getPendingApprovals(sessionId?: string): PendingApproval[] {
    const approvals = Array.from(this.pendingApprovals.values());
    if (sessionId) {
      return approvals.filter(a => a.sessionId === sessionId);
    }
    return approvals;
  }

  /**
   * Cancel all pending approvals for a session
   */
  cancelSessionApprovals(sessionId: string): void {
    for (const [id, approval] of this.pendingApprovals) {
      if (approval.sessionId === sessionId) {
        if (approval.timeout) {
          clearTimeout(approval.timeout);
        }
        approval.reject(new Error('Session cancelled'));
        this.pendingApprovals.delete(id);
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all timeouts
    for (const approval of this.pendingApprovals.values()) {
      if (approval.timeout) {
        clearTimeout(approval.timeout);
      }
    }

    // Clear maps
    this.pendingApprovals.clear();
    this.approvalPolicies.clear();
    this.wsClients.clear();

    // Remove listeners
    this.removeAllListeners();
  }
}
