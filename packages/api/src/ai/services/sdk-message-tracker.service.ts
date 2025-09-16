import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  Usage,
} from '@anthropic-ai/claude-code';

export interface TrackedMessage {
  correlationId: string;
  sessionId: string;
  message: SDKMessage;
  timestamp: Date;
  messageNumber: number;
  parentToolUseId?: string;
}

export interface SessionTrackingMetrics {
  sessionId: string;
  correlationId: string;
  startTime: Date;
  endTime?: Date;
  messageCount: number;
  toolCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  permissionDenialCount: number;
  averageResponseTimeMs?: number;
  lastMessageTimestamp?: Date;
}

export interface ToolMetrics {
  toolName: string;
  callCount: number;
  successCount: number;
  failureCount: number;
  denialCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastUsed: Date;
}

/**
 * SDK Message Tracker Service
 * Tracks all SDK messages with correlation IDs and provides metrics
 */
export class SDKMessageTracker {
  private messages = new Map<string, TrackedMessage[]>();
  private sessionMetrics = new Map<string, SessionTrackingMetrics>();
  private toolMetrics = new Map<string, ToolMetrics>();
  private messageCounter = new Map<string, number>();
  private sessionLastActivity = new Map<string, Date>();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private isRunning = false;

  constructor() {
    // Do not auto-start cleanup interval to avoid side effects on module import
    // Call startCleanupInterval() explicitly when needed
  }

  /**
   * Start the cleanup interval
   * Must be called explicitly to begin session cleanup
   */
  startCleanupInterval(): void {
    if (this.isRunning) {
      return; // Already running
    }

    this.isRunning = true;

    // Clean up old sessions every 30 minutes
    this.cleanupIntervalId = setInterval(
      () => {
        this.cleanupStaleSessions();
      },
      30 * 60 * 1000
    );
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Clean up stale sessions that haven't been active for SESSION_TTL_MS
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    // Find stale sessions
    for (const [
      sessionId,
      lastActivity,
    ] of this.sessionLastActivity.entries()) {
      if (now - lastActivity.getTime() > this.SESSION_TTL_MS) {
        staleSessionIds.push(sessionId);
      }
    }

    // Clean up stale sessions
    for (const sessionId of staleSessionIds) {
      this.clearSession(sessionId);
    }

    // Log cleanup summary (could emit an event instead)
    if (staleSessionIds.length > 0) {
      console.log(
        `[SDKMessageTracker] Cleaned up ${staleSessionIds.length} stale sessions`
      );
    }
  }

  /**
   * Track an SDK message with correlation ID
   */
  trackMessage(
    message: SDKMessage,
    sessionId: string,
    correlationId: string
  ): TrackedMessage {
    const messageNumber = this.getNextMessageNumber(sessionId);

    const trackedMessage: TrackedMessage = {
      correlationId,
      sessionId,
      message,
      timestamp: new Date(),
      messageNumber,
      parentToolUseId: this.extractParentToolUseId(message),
    };

    // Store message
    const sessionMessages = this.messages.get(sessionId) ?? [];
    sessionMessages.push(trackedMessage);
    this.messages.set(sessionId, sessionMessages);

    // Update last activity timestamp for TTL tracking
    this.sessionLastActivity.set(sessionId, new Date());

    // Update metrics based on message type
    this.updateMetricsForMessage(message, sessionId, correlationId);

    return trackedMessage;
  }

  /**
   * Update session metrics based on message type
   */
  private updateMetricsForMessage(
    message: SDKMessage,
    sessionId: string,
    correlationId: string
  ): void {
    let metrics = this.sessionMetrics.get(sessionId);

    if (!metrics) {
      metrics = this.initializeSessionMetrics(sessionId, correlationId);
      this.sessionMetrics.set(sessionId, metrics);
    }

    metrics.messageCount++;
    metrics.lastMessageTimestamp = new Date();

    switch (message.type) {
      case 'system':
        this.handleSystemMessage(message as SDKSystemMessage, metrics);
        break;

      case 'assistant':
        this.handleAssistantMessage(message, metrics);
        break;

      case 'result':
        this.handleResultMessage(message, metrics);
        break;

      case 'stream_event':
        // Track partial messages for latency calculation
        this.handleStreamEvent(message, metrics);
        break;
    }

    this.sessionMetrics.set(sessionId, metrics);
  }

  /**
   * Initialize session metrics
   */
  private initializeSessionMetrics(
    sessionId: string,
    correlationId: string
  ): SessionTrackingMetrics {
    return {
      sessionId,
      correlationId,
      startTime: new Date(),
      messageCount: 0,
      toolCallCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCostUsd: 0,
      permissionDenialCount: 0,
    };
  }

  /**
   * Handle system message metrics
   */
  private handleSystemMessage(
    message: SDKSystemMessage,
    metrics: SessionTrackingMetrics
  ): void {
    if (message.subtype === 'init') {
      // Track initialization
      metrics.startTime = new Date();
    }
  }

  /**
   * Handle assistant message metrics
   */
  private handleAssistantMessage(
    message: SDKAssistantMessage,
    metrics: SessionTrackingMetrics
  ): void {
    // Check for tool uses
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const assistantMessage = message as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (assistantMessage.message?.content) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      for (const content of assistantMessage.message.content) {
        if (
          typeof content === 'object' &&
          content !== null &&
          'type' in content &&
          (content as { type: unknown }).type === 'tool_use' &&
          'name' in content &&
          'id' in content
        ) {
          metrics.toolCallCount++;
          this.trackToolUse(
            String((content as { name: unknown }).name),
            String((content as { id: unknown }).id),
            metrics.sessionId
          );
        }
      }
    }

    // Track token usage if available
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (assistantMessage.message?.usage) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.updateTokenUsage(metrics, assistantMessage.message.usage);
    }
  }

  /**
   * Handle result message metrics
   */
  private handleResultMessage(
    message: SDKResultMessage,
    metrics: SessionTrackingMetrics
  ): void {
    metrics.endTime = new Date();

    // Update token usage
    if (message.usage) {
      metrics.totalInputTokens += message.usage.input_tokens ?? 0;
      metrics.totalOutputTokens += message.usage.output_tokens ?? 0;
      metrics.totalCacheReadTokens +=
        message.usage.cache_read_input_tokens ?? 0;
      metrics.totalCacheCreationTokens +=
        message.usage.cache_creation_input_tokens ?? 0;
    }

    // Update cost
    if (message.total_cost_usd) {
      metrics.totalCostUsd = message.total_cost_usd;
    }

    // Track permission denials
    if (message.permission_denials?.length) {
      metrics.permissionDenialCount += message.permission_denials.length;

      // Track denials per tool
      for (const denial of message.permission_denials) {
        this.trackToolDenial(denial.tool_name);
      }
    }

    // Calculate average response time
    if (message.duration_ms) {
      const previousAvg = metrics.averageResponseTimeMs ?? 0;
      const messageCount = metrics.messageCount || 1;
      metrics.averageResponseTimeMs =
        (previousAvg * (messageCount - 1) + message.duration_ms) / messageCount;
    }
  }

  /**
   * Handle stream event for partial messages
   */
  private handleStreamEvent(
    _message: SDKPartialAssistantMessage,
    metrics: SessionTrackingMetrics
  ): void {
    // Track streaming events for real-time metrics
    // This is useful for measuring streaming latency
    metrics.lastMessageTimestamp = new Date();
  }

  /**
   * Update token usage from Usage object
   */
  private updateTokenUsage(
    metrics: SessionTrackingMetrics,
    usage: Usage
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const usageData = usage as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    metrics.totalInputTokens += usageData.input_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    metrics.totalOutputTokens += usageData.output_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    metrics.totalCacheReadTokens += usageData.cache_read_input_tokens ?? 0;

    metrics.totalCacheCreationTokens +=
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      usageData.cache_creation_input_tokens ?? 0;
  }

  /**
   * Track tool usage metrics
   */
  private trackToolUse(
    toolName: string,
    _toolUseId: string,
    _sessionId: string
  ): void {
    let toolMetric = this.toolMetrics.get(toolName);

    if (!toolMetric) {
      toolMetric = {
        toolName,
        callCount: 0,
        successCount: 0,
        failureCount: 0,
        denialCount: 0,
        totalDurationMs: 0,
        averageDurationMs: 0,
        lastUsed: new Date(),
      };
      this.toolMetrics.set(toolName, toolMetric);
    }

    toolMetric.callCount++;
    toolMetric.lastUsed = new Date();

    this.toolMetrics.set(toolName, toolMetric);
  }

  /**
   * Track tool denial
   */
  private trackToolDenial(toolName: string): void {
    const toolMetric = this.toolMetrics.get(toolName);
    if (toolMetric) {
      toolMetric.denialCount++;
      this.toolMetrics.set(toolName, toolMetric);
    }
  }

  /**
   * Track tool result (success/failure)
   */
  trackToolResult(
    toolName: string,
    success: boolean,
    durationMs: number
  ): void {
    const toolMetric = this.toolMetrics.get(toolName);
    if (toolMetric) {
      if (success) {
        toolMetric.successCount++;
      } else {
        toolMetric.failureCount++;
      }

      toolMetric.totalDurationMs += durationMs;
      toolMetric.averageDurationMs =
        toolMetric.totalDurationMs /
        (toolMetric.successCount + toolMetric.failureCount);

      this.toolMetrics.set(toolName, toolMetric);
    }
  }

  /**
   * Get next message number for session
   */
  private getNextMessageNumber(sessionId: string): number {
    const current = this.messageCounter.get(sessionId) ?? 0;
    const next = current + 1;
    this.messageCounter.set(sessionId, next);
    return next;
  }

  /**
   * Extract parent tool use ID from message
   */
  private extractParentToolUseId(message: SDKMessage): string | undefined {
    if ('parent_tool_use_id' in message && message.parent_tool_use_id) {
      return message.parent_tool_use_id;
    }
    return undefined;
  }

  /**
   * Get all messages for a session
   */
  getSessionMessages(sessionId: string): TrackedMessage[] {
    return this.messages.get(sessionId) ?? [];
  }

  /**
   * Get messages by correlation ID
   */
  getMessagesByCorrelationId(correlationId: string): TrackedMessage[] {
    const result: TrackedMessage[] = [];

    for (const messages of this.messages.values()) {
      const filtered = messages.filter(m => m.correlationId === correlationId);
      result.push(...filtered);
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): SessionTrackingMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  /**
   * Get all tool metrics
   */
  getAllToolMetrics(): ToolMetrics[] {
    return Array.from(this.toolMetrics.values());
  }

  /**
   * Get tool metrics by name
   */
  getToolMetrics(toolName: string): ToolMetrics | undefined {
    return this.toolMetrics.get(toolName);
  }

  /**
   * Export session data for audit
   */
  exportSessionData(sessionId: string): {
    messages: TrackedMessage[];
    metrics: SessionTrackingMetrics | undefined;
    toolMetrics: ToolMetrics[];
  } {
    const messages = this.getSessionMessages(sessionId);
    const metrics = this.getSessionMetrics(sessionId);

    // Get tool metrics used in this session
    const usedTools = new Set<string>();
    for (const msg of messages) {
      if (msg.message.type === 'assistant') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const assistantMsg = msg.message as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (assistantMsg.message?.content) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          for (const content of assistantMsg.message.content) {
            if (
              typeof content === 'object' &&
              content !== null &&
              'type' in content &&
              (content as { type: unknown }).type === 'tool_use' &&
              'name' in content
            ) {
              usedTools.add(String((content as { name: unknown }).name));
            }
          }
        }
      }
    }

    const toolMetrics = Array.from(usedTools)
      .map(tool => this.getToolMetrics(tool))
      .filter((m): m is ToolMetrics => m !== undefined);

    return { messages, metrics, toolMetrics };
  }

  /**
   * Clear session data
   */
  clearSession(sessionId: string): void {
    this.messages.delete(sessionId);
    this.sessionMetrics.delete(sessionId);
    this.messageCounter.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.messages.clear();
    this.sessionMetrics.clear();
    this.toolMetrics.clear();
    this.messageCounter.clear();
    this.sessionLastActivity.clear();
  }
}

// Export singleton instance
export const messageTracker = new SDKMessageTracker();
