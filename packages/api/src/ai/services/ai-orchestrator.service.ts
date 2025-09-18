/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

import { generateCorrelationId } from '../../utils/correlation-id';
import { sanitizeObject } from '../../utils/pii-sanitizer';
import { SDKOptionsFactory } from '../config/sdk-options.config';

import { messageTracker } from './sdk-message-tracker.service';

import type {
  NetworkDiagnosticPrompt,
  RemediationScriptPrompt,
  PerformanceAnalysisPrompt,
  SecurityAssessmentPrompt,
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
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildDiagnosticPrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(
      promptText,
      options,
      sessionId,
      correlationId
    );
  }

  /**
   * Generate remediation scripts with HITL approval
   */
  async *generateRemediation(
    prompt: RemediationScriptPrompt,
    sessionId: string,
    canUseTool: CanUseTool,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildRemediationPrompt(prompt);
    const options: Partial<Options> = {
      ...SDKOptionsFactory.createRemediationOptions(),
      canUseTool,
    };

    yield* this.executeStreamingQuery(
      promptText,
      options,
      sessionId,
      correlationId
    );
  }

  /**
   * Analyze performance metrics
   */
  async *analyzePerformance(
    prompt: PerformanceAnalysisPrompt,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildPerformancePrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(
      promptText,
      options,
      sessionId,
      correlationId
    );
  }

  /**
   * Perform security assessment
   */
  async *analyzeSecurity(
    prompt: SecurityAssessmentPrompt,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void> {
    const promptText = this.buildSecurityPrompt(prompt);
    const options = SDKOptionsFactory.createDiagnosticOptions();

    yield* this.executeStreamingQuery(
      promptText,
      options,
      sessionId,
      correlationId
    );
  }

  /**
   * Core streaming query execution with SDK integration
   */
  private async *executeStreamingQuery(
    promptText: string,
    options: Partial<Options>,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void> {
    // Generate correlation ID if not provided
    const corrId = correlationId ?? generateCorrelationId();

    // Create abort controller for this query
    const abortController = new globalThis.AbortController();
    this.abortControllers.set(sessionId, abortController);

    // Configure options with abort controller
    const queryOptions: Partial<Options> = {
      ...options,
      // Some SDK versions may not type abortController on Options; pass at runtime.
      abortController: abortController as unknown as never,
    };

    // Debug: Log the options being passed to SDK
    console.log('Calling Claude SDK with options:', {
      model: queryOptions.model,
      hasEnv: !!queryOptions.env,
      envKeys: queryOptions.env ? Object.keys(queryOptions.env) : [],
      hasAnthropicKey: !!queryOptions.env?.ANTHROPIC_API_KEY,
      actualApiKey: process.env.ANTHROPIC_API_KEY
        ? 'Set in process.env'
        : 'NOT in process.env',
      promptLength: promptText.length,
    });

    // Ensure ANTHROPIC_API_KEY is in the process environment for the SDK worker
    if (queryOptions.env?.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = queryOptions.env.ANTHROPIC_API_KEY;
      console.log('Set ANTHROPIC_API_KEY in process.env for SDK worker');
    }

    // Debug: Test if we can call the SDK at all with minimal options
    console.log('Testing SDK with minimal options first...');

    try {
      // Try with absolute minimal options first
      const testOptions: Partial<Options> = {
        model: 'claude-3-5-sonnet-20241022',
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
          PATH: process.env.PATH!,
        },
      };

      console.log('Minimal test options:', {
        model: testOptions.model,
        hasApiKey: !!testOptions.env?.ANTHROPIC_API_KEY,
        apiKeyLength: testOptions.env?.ANTHROPIC_API_KEY?.length,
      });

      // Create query with SDK
      const queryResponse = query({
        prompt: promptText,
        options: testOptions as Options,
      });

      // Store active query
      this.activeQueries.set(sessionId, queryResponse);

      // Stream messages
      for await (const message of queryResponse) {
        console.log(`[SDK Message] Type: ${message.type}`);

        // Log specific message types for debugging
        if (message.type === 'assistant') {
          console.log('[SDK] Assistant message received');
        } else if (message.type === 'result') {
          console.log('[SDK] Result:', (message as any).result);
        } else if (message.type === 'system') {
          console.log('[SDK] System message:', (message as any).subtype);
        }

        // Track message with correlation ID
        messageTracker.trackMessage(message, sessionId, corrId);

        // Process different message types
        await this.processMessage(message, sessionId, corrId);

        // Yield message to caller
        yield message;
      }
    } catch (error) {
      // Check for abort error by message or error type
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('abort') || errorMessage.includes('cancel')) {
        this.emit('query:aborted', { sessionId, correlationId: corrId });
      } else {
        this.emit('query:error', { sessionId, correlationId: corrId, error });
        throw error;
      }
    } finally {
      // Cleanup
      this.activeQueries.delete(sessionId);
      this.abortControllers.delete(sessionId);
      messageTracker.clearSession(sessionId);
    }
  }

  /**
   * Process SDK messages for tracking and side effects
   */
  private async processMessage(
    message: SDKMessage,
    sessionId: string,
    correlationId: string
  ): Promise<void> {
    switch (message.type) {
      case 'assistant':
        await this.handleAssistantMessage(message, sessionId, correlationId);
        break;

      case 'result':
        await this.handleResultMessage(message, sessionId, correlationId);
        break;

      case 'system':
        await this.handleSystemMessage(
          message as SDKSystemMessage,
          sessionId,
          correlationId
        );
        break;

      case 'stream_event':
        // Partial messages for real-time updates
        this.emit('stream:partial', { sessionId, correlationId, message });
        break;
    }
  }

  /**
   * Handle assistant messages (tool calls, responses)
   */
  private async handleAssistantMessage(
    message: SDKAssistantMessage,
    sessionId: string,
    correlationId: string
  ): Promise<void> {
    this.emit('assistant:message', { sessionId, correlationId, message });

    // Check for tool use in message content
    if (message.message.content) {
      for (const content of message.message.content) {
        if (
          'type' in content &&
          content.type === 'tool_use' &&
          'name' in content
        ) {
          const toolStartTime = Date.now();
          this.emit('tool:use', {
            sessionId,
            correlationId,
            toolName: (content as any).name,
            toolInput: (content as any).input,
            toolId: (content as any).id,
            timestamp: toolStartTime,
          });
        }
      }
    }
  }

  /**
   * Handle result messages (completion, errors, usage)
   */
  private async handleResultMessage(
    message: SDKResultMessage,
    sessionId: string,
    correlationId: string
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
        correlationId,
        denials: message.permission_denials,
      });
    }

    // Emit completion or error
    if (message.subtype === 'success') {
      this.emit('query:complete', {
        sessionId,
        correlationId,
        result: message.result,
        usage: message.usage,
        cost: message.total_cost_usd,
      });
    } else {
      this.emit('query:error', {
        sessionId,
        correlationId,
        errorType: message.subtype,
        usage: message.usage,
      });
    }
  }

  /**
   * Handle system messages (initialization, configuration)
   */
  private async handleSystemMessage(
    message: SDKSystemMessage,
    sessionId: string,
    correlationId: string
  ): Promise<void> {
    if (message.subtype === 'init') {
      this.emit('session:init', {
        sessionId,
        correlationId,
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
    interface DiagnosticInput {
      deviceId: string;
      deviceType: string;
      symptoms: string[];
      diagnosticData: {
        pingResults: unknown;
        traceroute: unknown;
        dnsResolution: unknown;
        networkInterfaces: unknown;
        connectionStatus: unknown;
      };
    }

    const input = prompt.input as DiagnosticInput;

    // Sanitize entire input to handle all potential PII
    const sanitizedInput = sanitizeObject(input);

    return `
    Analyze the following network diagnostic data and provide detailed insights:

    Device ID: ${sanitizedInput.deviceId}
    Device Type: ${sanitizedInput.deviceType}
    Reported Symptoms: ${Array.isArray(sanitizedInput.symptoms) ? sanitizedInput.symptoms.join(', ') : ''}

    Diagnostic Data:
    - Ping Results: ${JSON.stringify(sanitizedInput.diagnosticData?.pingResults)}
    - Traceroute: ${JSON.stringify(sanitizedInput.diagnosticData?.traceroute)}
    - DNS Resolution: ${JSON.stringify(sanitizedInput.diagnosticData?.dnsResolution)}
    - Network Interfaces: ${JSON.stringify(sanitizedInput.diagnosticData?.networkInterfaces)}
    - Connection Status: ${JSON.stringify(sanitizedInput.diagnosticData?.connectionStatus)}

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
  private buildRemediationPrompt(prompt: RemediationScriptPrompt): string {
    interface RemediationInput {
      issue: string;
      rootCause: string;
      targetDevice: Record<string, unknown>;
      constraints: {
        maxExecutionTime: number;
        rollbackRequired: boolean;
      };
      proposedActions?: Array<{ description: string }>;
    }

    const input = prompt.input as RemediationInput;

    // Sanitize entire input to handle all potential PII
    const sanitizedInput = sanitizeObject(input);

    return `
    Generate remediation scripts for the following network issue:

    Issue: ${sanitizedInput.issue}
    Root Cause: ${sanitizedInput.rootCause}
    Target Device: ${JSON.stringify(sanitizedInput.targetDevice)}
    Proposed Actions: ${Array.isArray(sanitizedInput.proposedActions) ? sanitizedInput.proposedActions.map((a: unknown) => (a as { description?: string }).description || '').join('; ') : 'None'}

    Constraints:
    - Max Execution Time: ${sanitizedInput.constraints.maxExecutionTime} seconds
    - Rollback Required: ${sanitizedInput.constraints.rollbackRequired}

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
    interface PerformanceInput {
      metrics: {
        bandwidth?: unknown;
        latency?: unknown;
        throughput?: unknown;
        packetLoss?: unknown;
        utilization?: unknown;
        jitter?: unknown;
      };
      timeRange: {
        start: string;
        end: string;
      };
      thresholds?: {
        latencyMs: number;
        packetLossPercent: number;
        utilizationPercent: number;
      };
      baseline?: unknown;
    }

    const performanceInput = prompt.input as unknown as PerformanceInput;
    const { metrics, timeRange } = performanceInput;
    const thresholds = performanceInput.thresholds ?? {
      latencyMs: 100,
      packetLossPercent: 1,
      utilizationPercent: 80,
    };

    // Sanitize metrics data for PII
    const sanitizedMetrics = sanitizeObject(metrics);

    return `
    Analyze network performance metrics and identify optimization opportunities:

    Time Range: ${timeRange.start} to ${timeRange.end}

    Metrics:
    - Latency: ${JSON.stringify(sanitizedMetrics.latency)}
    - Throughput: ${JSON.stringify(sanitizedMetrics.throughput)}
    - Packet Loss: ${JSON.stringify(sanitizedMetrics.packetLoss)}
    - Utilization: ${JSON.stringify(sanitizedMetrics.utilization)}

    Performance Thresholds:
    - Latency Warning: ${thresholds?.latencyMs ?? 100}ms
    - Packet Loss Critical: ${thresholds?.packetLossPercent ?? 5}%
    - Utilization High: ${thresholds?.utilizationPercent ?? 80}%

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
  private buildSecurityPrompt(prompt: SecurityAssessmentPrompt): string {
    interface SecurityInput {
      scanResults: {
        openPorts: unknown;
        vulnerabilities?: unknown[];
      };
      complianceRequirements?: unknown[];
    }

    const { scanResults, complianceRequirements } =
      prompt.input as SecurityInput;

    // Sanitize scan results which may contain IPs and other PII
    const sanitizedScanResults = sanitizeObject(scanResults);
    const sanitizedCompliance = sanitizeObject(complianceRequirements || []);

    return `
    Perform security assessment for network infrastructure:

    Open Ports: ${JSON.stringify(sanitizedScanResults.openPorts)}
    Vulnerabilities: ${JSON.stringify(sanitizedScanResults.vulnerabilities || [])}
    Compliance Requirements: ${JSON.stringify(sanitizedCompliance)}

    Provide:
    1. Vulnerability assessment with severity and impact
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
    for (const controller of this.abortControllers.values()) {
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
