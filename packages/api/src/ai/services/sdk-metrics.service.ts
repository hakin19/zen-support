import { EventEmitter } from 'events';

import { messageTracker } from './sdk-message-tracker.service';

// import type { ToolMetrics } from './sdk-message-tracker.service';

export interface TokenMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  inputTokenRate: number; // tokens per minute
  outputTokenRate: number; // tokens per minute
}

export interface LatencyMetrics {
  averageResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
}

export interface ToolCallMetrics {
  totalCalls: number;
  successRate: number;
  denialRate: number;
  averageDurationMs: number;
  topTools: Array<{
    name: string;
    calls: number;
    successRate: number;
  }>;
}

export interface AggregatedSessionMetrics {
  activeSessions: number;
  totalSessions: number;
  averageSessionDurationMs: number;
  sessionSuccessRate: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  recentErrors: Array<{
    type: string;
    timestamp: Date;
    sessionId?: string;
  }>;
}

export interface CurrentMetrics {
  timestamp: Date;
  tokens: TokenMetrics;
  latency: LatencyMetrics;
  tools: ToolCallMetrics;
  sessions: AggregatedSessionMetrics;
  errors: ErrorMetrics;
}

/**
 * SDK Metrics Service
 * Collects and aggregates metrics for the Claude Code SDK integration
 */
export class SDKMetricsService extends EventEmitter {
  private sessionStartTimes = new Map<string, Date>();
  private sessionEndTimes = new Map<string, Date>();
  private responseTimes: number[] = [];
  private errorCounts = new Map<string, number>();
  private recentErrors: Array<{
    type: string;
    timestamp: Date;
    sessionId?: string;
  }> = [];
  private tokenUsageHistory: Array<{
    timestamp: Date;
    inputTokens: number;
    outputTokens: number;
  }> = [];
  private metricsIntervalId: NodeJS.Timeout | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    // Do not auto-start timers to avoid side effects on module import
  }

  /**
   * Start collecting metrics periodically
   * Must be called explicitly to begin metric collection
   */
  startMetricsCollection(): void {
    if (this.isRunning) {
      return; // Already running
    }

    this.isRunning = true;

    // Collect metrics every minute
    this.metricsIntervalId = setInterval(() => {
      this.collectAndEmitMetrics();
    }, 60000);

    // Clean up old data every hour
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldData();
    }, 3600000);
  }

  /**
   * Stop collecting metrics and clear timers
   */
  stopMetricsCollection(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.metricsIntervalId) {
      clearInterval(this.metricsIntervalId);
      this.metricsIntervalId = null;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Collect current metrics snapshot
   */
  collectCurrentMetrics(
    period: 'minute' | 'hour' | 'day' = 'minute'
  ): CurrentMetrics {
    const timestamp = new Date();
    const periodMs = this.getPeriodMs(period);
    const cutoff = new Date(timestamp.getTime() - periodMs);

    return {
      timestamp,
      tokens: this.calculateTokenMetrics(cutoff),
      latency: this.calculateLatencyMetrics(),
      tools: this.calculateToolMetrics(),
      sessions: this.calculateSessionMetrics(cutoff),
      errors: this.calculateErrorMetrics(cutoff),
    };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(
    period: 'minute' | 'hour' | 'day' = 'minute',
    _limit = 100
  ): CurrentMetrics[] {
    // For now, return current metrics
    // In production, this would query stored historical data
    return [this.collectCurrentMetrics(period)];
  }

  /**
   * Track session start
   */
  trackSessionStart(sessionId: string): void {
    this.sessionStartTimes.set(sessionId, new Date());
  }

  /**
   * Track session end
   */
  trackSessionEnd(sessionId: string, success: boolean): void {
    this.sessionEndTimes.set(sessionId, new Date());

    if (!success) {
      this.incrementErrorCount('session_failure');
    }

    // Calculate and store response time
    const startTime = this.sessionStartTimes.get(sessionId);
    const endTime = this.sessionEndTimes.get(sessionId);
    if (startTime && endTime) {
      const responseTime = endTime.getTime() - startTime.getTime();
      this.responseTimes.push(responseTime);

      // Keep only last 1000 response times
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }
    }
  }

  /**
   * Track token usage
   */
  trackTokenUsage(inputTokens: number, outputTokens: number): void {
    this.tokenUsageHistory.push({
      timestamp: new Date(),
      inputTokens,
      outputTokens,
    });

    // Keep only last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.tokenUsageHistory = this.tokenUsageHistory.filter(
      entry => entry.timestamp > oneDayAgo
    );
  }

  /**
   * Track error
   */
  trackError(errorType: string, sessionId?: string): void {
    this.incrementErrorCount(errorType);
    this.recentErrors.push({
      type: errorType,
      timestamp: new Date(),
      sessionId,
    });

    // Keep only last 100 errors
    if (this.recentErrors.length > 100) {
      this.recentErrors = this.recentErrors.slice(-100);
    }
  }

  /**
   * Export metrics for Prometheus
   */
  exportPrometheusMetrics(): string {
    const metrics = this.collectCurrentMetrics();
    const lines: string[] = [];

    // Token metrics
    lines.push(`# HELP claude_sdk_tokens_total Total tokens processed`);
    lines.push(`# TYPE claude_sdk_tokens_total counter`);
    lines.push(
      `claude_sdk_tokens_total{type="input"} ${metrics.tokens.totalInputTokens}`
    );
    lines.push(
      `claude_sdk_tokens_total{type="output"} ${metrics.tokens.totalOutputTokens}`
    );

    // Response time metrics
    lines.push(
      `# HELP claude_sdk_response_time_ms Response time in milliseconds`
    );
    lines.push(`# TYPE claude_sdk_response_time_ms summary`);
    lines.push(
      `claude_sdk_response_time_ms{quantile="0.5"} ${metrics.latency.p50ResponseTimeMs}`
    );
    lines.push(
      `claude_sdk_response_time_ms{quantile="0.95"} ${metrics.latency.p95ResponseTimeMs}`
    );
    lines.push(
      `claude_sdk_response_time_ms{quantile="0.99"} ${metrics.latency.p99ResponseTimeMs}`
    );
    lines.push(
      `claude_sdk_response_time_ms_sum ${metrics.latency.averageResponseTimeMs * metrics.sessions.totalSessions}`
    );
    lines.push(
      `claude_sdk_response_time_ms_count ${metrics.sessions.totalSessions}`
    );

    // Tool metrics
    lines.push(`# HELP claude_sdk_tools_total Total tool calls`);
    lines.push(`# TYPE claude_sdk_tools_total counter`);
    lines.push(`claude_sdk_tools_total ${metrics.tools.totalCalls}`);

    // Session metrics
    lines.push(`# HELP claude_sdk_sessions_active Active sessions`);
    lines.push(`# TYPE claude_sdk_sessions_active gauge`);
    lines.push(`claude_sdk_sessions_active ${metrics.sessions.activeSessions}`);

    // Error metrics
    lines.push(`# HELP claude_sdk_errors_total Total errors`);
    lines.push(`# TYPE claude_sdk_errors_total counter`);
    lines.push(`claude_sdk_errors_total ${metrics.errors.totalErrors}`);

    return `${lines.join('\n')}\n`;
  }

  /**
   * Export metrics for CloudWatch
   */
  exportCloudWatchMetrics(): Array<{
    MetricName: string;
    Value: number;
    Unit: string;
    Timestamp: Date;
    Dimensions?: Array<{ Name: string; Value: string }>;
  }> {
    const metrics = this.collectCurrentMetrics();
    const timestamp = new Date();

    return [
      {
        MetricName: 'TokensProcessed',
        Value:
          metrics.tokens.totalInputTokens + metrics.tokens.totalOutputTokens,
        Unit: 'Count',
        Timestamp: timestamp,
      },
      {
        MetricName: 'ResponseTime',
        Value: metrics.latency.averageResponseTimeMs,
        Unit: 'Milliseconds',
        Timestamp: timestamp,
      },
      {
        MetricName: 'ToolCalls',
        Value: metrics.tools.totalCalls,
        Unit: 'Count',
        Timestamp: timestamp,
      },
      {
        MetricName: 'ActiveSessions',
        Value: metrics.sessions.activeSessions,
        Unit: 'Count',
        Timestamp: timestamp,
      },
      {
        MetricName: 'ErrorRate',
        Value: metrics.errors.errorRate,
        Unit: 'Percent',
        Timestamp: timestamp,
      },
    ];
  }

  /**
   * Calculate token metrics for period
   */
  private calculateTokenMetrics(cutoff: Date): TokenMetrics {
    const recentUsage = this.tokenUsageHistory.filter(
      entry => entry.timestamp > cutoff
    );

    const totalInputTokens = recentUsage.reduce(
      (sum, entry) => sum + entry.inputTokens,
      0
    );
    const totalOutputTokens = recentUsage.reduce(
      (sum, entry) => sum + entry.outputTokens,
      0
    );

    // Calculate rates (tokens per minute)
    const periodMinutes = (Date.now() - cutoff.getTime()) / 60000;
    const inputTokenRate = totalInputTokens / Math.max(periodMinutes, 1);
    const outputTokenRate = totalOutputTokens / Math.max(periodMinutes, 1);

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens: 0, // TODO: Track from message tracker
      totalCacheCreationTokens: 0, // TODO: Track from message tracker
      inputTokenRate,
      outputTokenRate,
    };
  }

  /**
   * Calculate latency metrics
   */
  private calculateLatencyMetrics(): LatencyMetrics {
    if (this.responseTimes.length === 0) {
      return {
        averageResponseTimeMs: 0,
        p50ResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        p99ResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0,
      };
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const length = sorted.length;

    return {
      averageResponseTimeMs: sorted.reduce((a, b) => a + b, 0) / length,
      p50ResponseTimeMs: sorted[Math.floor(length * 0.5)] ?? 0,
      p95ResponseTimeMs: sorted[Math.floor(length * 0.95)] ?? 0,
      p99ResponseTimeMs: sorted[Math.floor(length * 0.99)] ?? 0,
      minResponseTimeMs: sorted[0] ?? 0,
      maxResponseTimeMs: sorted[length - 1] ?? 0,
    };
  }

  /**
   * Calculate tool metrics
   */
  private calculateToolMetrics(): ToolCallMetrics {
    const toolMetrics = messageTracker.getAllToolMetrics();

    const totalCalls = toolMetrics.reduce(
      (sum, tool) => sum + tool.callCount,
      0
    );
    const totalSuccess = toolMetrics.reduce(
      (sum, tool) => sum + tool.successCount,
      0
    );
    const totalDenials = toolMetrics.reduce(
      (sum, tool) => sum + tool.denialCount,
      0
    );
    const totalDuration = toolMetrics.reduce(
      (sum, tool) => sum + tool.totalDurationMs,
      0
    );

    const successRate = totalCalls > 0 ? (totalSuccess / totalCalls) * 100 : 0;
    const denialRate = totalCalls > 0 ? (totalDenials / totalCalls) * 100 : 0;
    const averageDurationMs = totalCalls > 0 ? totalDuration / totalCalls : 0;

    const topTools = toolMetrics
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5)
      .map(tool => ({
        name: tool.toolName,
        calls: tool.callCount,
        successRate:
          tool.callCount > 0 ? (tool.successCount / tool.callCount) * 100 : 0,
      }));

    return {
      totalCalls,
      successRate,
      denialRate,
      averageDurationMs,
      topTools,
    };
  }

  /**
   * Calculate session metrics for period
   */
  private calculateSessionMetrics(cutoff: Date): AggregatedSessionMetrics {
    const recentStarts = Array.from(this.sessionStartTimes.values()).filter(
      time => time > cutoff
    );

    const activeSessions =
      this.sessionStartTimes.size - this.sessionEndTimes.size;
    const totalSessions = recentStarts.length;

    // Calculate average session duration
    let totalDuration = 0;
    let completedSessions = 0;

    for (const [sessionId, startTime] of this.sessionStartTimes.entries()) {
      const endTime = this.sessionEndTimes.get(sessionId);
      if (endTime && startTime > cutoff) {
        totalDuration += endTime.getTime() - startTime.getTime();
        completedSessions++;
      }
    }

    const averageSessionDurationMs =
      completedSessions > 0 ? totalDuration / completedSessions : 0;

    // Calculate success rate (sessions without errors)
    const failedSessions = this.recentErrors.filter(
      error => error.type === 'session_failure' && error.timestamp > cutoff
    ).length;
    const sessionSuccessRate =
      totalSessions > 0
        ? ((totalSessions - failedSessions) / totalSessions) * 100
        : 100;

    return {
      activeSessions,
      totalSessions,
      averageSessionDurationMs,
      sessionSuccessRate,
    };
  }

  /**
   * Calculate error metrics for period
   */
  private calculateErrorMetrics(cutoff: Date): ErrorMetrics {
    const recentErrors = this.recentErrors.filter(
      error => error.timestamp > cutoff
    );

    const totalErrors = recentErrors.length;
    const periodMinutes = (Date.now() - cutoff.getTime()) / 60000;
    const errorRate = totalErrors / Math.max(periodMinutes, 1);

    const errorsByType: Record<string, number> = {};
    for (const error of recentErrors) {
      errorsByType[error.type] = (errorsByType[error.type] ?? 0) + 1;
    }

    return {
      totalErrors,
      errorRate,
      errorsByType,
      recentErrors: recentErrors.slice(-10), // Last 10 errors
    };
  }

  /**
   * Increment error count
   */
  private incrementErrorCount(errorType: string): void {
    const current = this.errorCounts.get(errorType) ?? 0;
    this.errorCounts.set(errorType, current + 1);
  }

  /**
   * Get period in milliseconds
   */
  private getPeriodMs(period: 'minute' | 'hour' | 'day'): number {
    switch (period) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }

  /**
   * Collect and emit metrics
   */
  private collectAndEmitMetrics(): void {
    const metrics = this.collectCurrentMetrics();
    this.emit('metrics:collected', metrics);
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Clean up old response times
    this.responseTimes = this.responseTimes.slice(-1000);

    // Clean up old token usage
    this.tokenUsageHistory = this.tokenUsageHistory.filter(
      entry => entry.timestamp > oneDayAgo
    );

    // Clean up old errors
    this.recentErrors = this.recentErrors.filter(
      error => error.timestamp > oneDayAgo
    );

    // Clean up old session data (keep only last 24 hours)
    for (const [sessionId, startTime] of this.sessionStartTimes.entries()) {
      if (startTime < oneDayAgo) {
        this.sessionStartTimes.delete(sessionId);
      }
    }

    for (const [sessionId, endTime] of this.sessionEndTimes.entries()) {
      if (endTime < oneDayAgo) {
        this.sessionEndTimes.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
// Note: Timers are not started automatically to avoid side effects
// Call metricsService.startMetricsCollection() to begin metric collection
export const metricsService = new SDKMetricsService();
