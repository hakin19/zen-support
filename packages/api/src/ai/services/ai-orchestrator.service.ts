/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { EventEmitter } from 'events';

import {
  query,
  type Query,
  type Options,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type CanUseTool,
  type ModelUsage,
} from '@anthropic-ai/claude-code';

import { SDKOptionsFactory } from '../config/sdk-options.config';

import type {
  NetworkDiagnosticPrompt,
  RemediationPrompt,
  PerformanceAnalysisPrompt,
  SecurityAnalysisPrompt,
} from '../prompts/network-analysis.prompts';

/**
 * AI Orchestrator Service using the official Claude Code SDK
 * Manages AI interactions with type-safe prompts and streaming support
 */
export class AIOrchestrator extends EventEmitter {
  private activeQueries: Map<string, Query> = new Map();
  private usageTracker: Map<string, ModelUsage> = new Map();
  private abortControllers: Map<string, globalThis.AbortController> = new Map();

  constructor() {
    super();
  }

  /**
   * Execute a diagnostic analysis with streaming support
   */
  async *analyzeDiagnostics(
    prompt: NetworkDiagnosticPrompt,
    sessionId: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildDiagnosticPrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(promptText, options, sessionId);
  }

  /**
   * Generate remediation scripts with HITL approval
   */
  async *generateRemediation(
    prompt: RemediationPrompt,
    sessionId: string,
    canUseTool: CanUseTool
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildRemediationPrompt(prompt);
    const options: Options = {
      ...SDKOptionsFactory.createRemediationOptions(),
      canUseTool,
    };

    yield* this.executeStreamingQuery(promptText, options, sessionId);
  }

  /**
   * Analyze performance metrics
   */
  async *analyzePerformance(
    prompt: PerformanceAnalysisPrompt,
    sessionId: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildPerformancePrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(promptText, options, sessionId);
  }

  /**
   * Perform security assessment
   */
  async *analyzeSecurity(
    prompt: SecurityAnalysisPrompt,
    sessionId: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildSecurityPrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(promptText, options, sessionId);
  }

  /**
   * Core streaming query execution with SDK integration
   */
  private async *executeStreamingQuery(
    promptText: string,
    options: Options,
    sessionId: string
  ): AsyncGenerator<SDKMessage, void> {
    // Create abort controller for this query
    const abortController = new globalThis.AbortController();
    this.abortControllers.set(sessionId, abortController);

    // Configure options with abort controller
    const queryOptions: Options = {
      ...options,
      abortController,
    };

    try {
      // Create query with SDK
      const queryResponse = query({
        prompt: promptText,
        options: queryOptions,
      });

      // Store active query
      this.activeQueries.set(sessionId, queryResponse);

      // Stream messages
      for await (const message of queryResponse) {
        // Process different message types
        await this.processMessage(message, sessionId);

        // Yield message to caller
        yield message;
      }
    } catch (error) {
      // Check for abort error by message or error type
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('abort') || errorMessage.includes('cancel')) {
        this.emit('query:aborted', { sessionId });
      } else {
        this.emit('query:error', { sessionId, error });
        throw error;
      }
    } finally {
      // Cleanup
      this.activeQueries.delete(sessionId);
      this.abortControllers.delete(sessionId);
    }
  }

  /**
   * Process SDK messages for tracking and side effects
   */
  private async processMessage(
    message: SDKMessage,
    sessionId: string
  ): Promise<void> {
    switch (message.type) {
      case 'assistant':
        await this.handleAssistantMessage(message, sessionId);
        break;

      case 'result':
        await this.handleResultMessage(message, sessionId);
        break;

      case 'system':
        await this.handleSystemMessage(message as SDKSystemMessage, sessionId);
        break;

      case 'stream_event':
        // Partial messages for real-time updates
        this.emit('stream:partial', { sessionId, message });
        break;
    }
  }

  /**
   * Handle assistant messages (tool calls, responses)
   */
  private handleAssistantMessage(
    message: SDKAssistantMessage,
    sessionId: string
  ): Promise<void> {
    this.emit('assistant:message', { sessionId, message });

    // Check for tool use in message content
    if (message.message.content) {
      for (const content of message.message.content) {
        if (
          'type' in content &&
          content.type === 'tool_use' &&
          'name' in content
        ) {
          this.emit('tool:use', {
            sessionId,
            toolName: (content as any).name,
            toolInput: (content as any).input,
            toolId: (content as any).id,
          });
        }
      }
    }
  }

  /**
   * Handle result messages (completion, errors, usage)
   */
  private handleResultMessage(
    message: SDKResultMessage,
    sessionId: string
  ): Promise<void> {
    // Track usage
    if (message.modelUsage) {
      for (const [model, usage] of Object.entries(message.modelUsage)) {
        this.trackUsage(sessionId, model, usage);
      }
    }

    // Handle permission denials
    if (message.permission_denials?.length > 0) {
      this.emit('permission:denied', {
        sessionId,
        denials: message.permission_denials,
      });
    }

    // Emit completion or error
    if (message.subtype === 'success') {
      this.emit('query:complete', {
        sessionId,
        result: message.result,
        usage: message.usage,
        cost: message.total_cost_usd,
      });
    } else {
      this.emit('query:error', {
        sessionId,
        errorType: message.subtype,
        usage: message.usage,
      });
    }
  }

  /**
   * Handle system messages (initialization, configuration)
   */
  private handleSystemMessage(
    message: SDKSystemMessage,
    sessionId: string
  ): Promise<void> {
    if (message.subtype === 'init') {
      this.emit('session:init', {
        sessionId,
        model: message.model,
        tools: message.tools,
        mcpServers: message.mcp_servers,
        permissionMode: message.permissionMode,
      });
    }
  }

  /**
   * Interrupt an active query
   */
  async interruptQuery(sessionId: string): Promise<void> {
    const query = this.activeQueries.get(sessionId);
    if (query) {
      await query.interrupt();
    }

    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Update permission mode for active query
   */
  async updatePermissionMode(
    sessionId: string,
    mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  ): Promise<void> {
    const query = this.activeQueries.get(sessionId);
    if (query) {
      await query.setPermissionMode(mode);
    }
  }

  /**
   * Get usage statistics for a session
   */
  getUsageStats(sessionId: string): ModelUsage | undefined {
    return this.usageTracker.get(sessionId);
  }

  /**
   * Track model usage
   */
  private trackUsage(
    sessionId: string,
    model: string,
    usage: ModelUsage
  ): void {
    const existing = this.usageTracker.get(sessionId);
    if (existing) {
      // Aggregate usage
      this.usageTracker.set(sessionId, {
        inputTokens: existing.inputTokens + usage.inputTokens,
        outputTokens: existing.outputTokens + usage.outputTokens,
        cacheReadInputTokens:
          existing.cacheReadInputTokens + usage.cacheReadInputTokens,
        cacheCreationInputTokens:
          existing.cacheCreationInputTokens + usage.cacheCreationInputTokens,
        webSearchRequests: existing.webSearchRequests + usage.webSearchRequests,
        costUSD: existing.costUSD + usage.costUSD,
      });
    } else {
      this.usageTracker.set(sessionId, usage);
    }

    this.emit('usage:update', { sessionId, model, usage });
  }

  /**
   * Build diagnostic prompt from template
   */
  private buildDiagnosticPrompt(prompt: NetworkDiagnosticPrompt): string {
    const { deviceId, deviceType, symptoms, diagnosticData } =
      prompt.input as any;

    return `
    Analyze the following network diagnostic data and provide detailed insights:

    Device ID: ${deviceId}
    Device Type: ${deviceType}
    Reported Symptoms: ${symptoms.join(', ')}

    Diagnostic Data:
    - Ping Results: ${JSON.stringify(diagnosticData.pingResults)}
    - Traceroute: ${JSON.stringify(diagnosticData.traceroute)}
    - DNS Resolution: ${JSON.stringify(diagnosticData.dnsResolution)}
    - Network Interfaces: ${JSON.stringify(diagnosticData.networkInterfaces)}
    - Connection Status: ${JSON.stringify(diagnosticData.connectionStatus)}

    Provide:
    1. Root cause analysis
    2. Impact assessment
    3. Recommended actions
    4. Estimated resolution time
    `;
  }

  /**
   * Build remediation prompt from template
   */
  private buildRemediationPrompt(prompt: RemediationPrompt): string {
    const { issueType, targetDevice, constraints, approvedActions } =
      prompt.input as any;

    return `
    Generate remediation scripts for the following network issue:

    Issue Type: ${issueType}
    Target Device: ${targetDevice}
    undefined

    Constraints:
    - Risk Level: ${constraints.riskLevel}
    - Max Downtime: ${constraints.maxDowntime} minutes
    - Rollback Required: ${constraints.requireRollback}

    Generate safe, idempotent scripts that:
    1. Validate prerequisites before execution
    2. Include error handling and logging
    3. Provide rollback procedures if required
    4. Minimize service disruption
    `;
  }

  /**
   * Build performance analysis prompt
   */
  private buildPerformancePrompt(prompt: PerformanceAnalysisPrompt): string {
    const { metrics, timeRange, thresholds } = prompt.input as any;

    return `
    Analyze network performance metrics and identify optimization opportunities:

    Time Range: ${timeRange.start} to ${timeRange.end}

    Metrics:
    - Latency: ${JSON.stringify(metrics.latency)}
    - Throughput: ${JSON.stringify(metrics.throughput)}
    - Packet Loss: ${JSON.stringify(metrics.packetLoss)}
    - Utilization: ${JSON.stringify(metrics.utilization)}

    Performance Thresholds:
    - Latency Warning: ${thresholds.latencyMs}ms
    - Packet Loss Critical: ${thresholds.packetLossPercent}%
    - Utilization High: ${thresholds.utilizationPercent}%

    Provide:
    1. Performance bottleneck identification
    2. Trend analysis
    3. Optimization recommendations
    4. Capacity planning insights
    `;
  }

  /**
   * Build security analysis prompt
   */
  private buildSecurityPrompt(prompt: SecurityAnalysisPrompt): string {
    const { scanType, targetRange, complianceFramework } = prompt.input as any;

    return `
    Perform security assessment for network infrastructure:

    Scan Type: ${scanType}
    Target Range: ${targetRange}
    Compliance Framework: ${complianceFramework || 'General best practices'}

    Assess:
    1. Open ports and services
    2. Configuration vulnerabilities
    3. Access control policies
    4. Encryption status
    5. Compliance gaps

    Provide:
    1. Vulnerability assessment with CVSS scores
    2. Risk prioritization matrix
    3. Remediation recommendations
    4. Compliance checklist
    `;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Abort all active queries
    for (const [sessionId, controller] of this.abortControllers) {
      controller.abort();
    }

    // Clear maps
    this.activeQueries.clear();
    this.abortControllers.clear();
    this.usageTracker.clear();

    // Remove all listeners
    this.removeAllListeners();
  }
}
