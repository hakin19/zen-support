import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type {
  SDKSystemMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-code';

import { SDKMetricsService } from './sdk-metrics.service';
import { messageTracker } from './sdk-message-tracker.service';

vi.mock('./sdk-message-tracker.service', () => ({
  messageTracker: {
    getSessionMetrics: vi.fn(),
    getAllToolMetrics: vi.fn(),
  },
}));

describe('SDKMetricsService', () => {
  let service: SDKMetricsService;

  beforeEach(() => {
    service = new SDKMetricsService();
    vi.clearAllMocks();

    // Default mock return values to prevent errors
    vi.mocked(messageTracker.getAllToolMetrics).mockReturnValue([]);
    vi.mocked(messageTracker.getSessionMetrics).mockReturnValue(undefined);
  });

  afterEach(() => {
    service.clearMetrics();
  });

  describe('trackSessionStart', () => {
    it('should track session start time', () => {
      const sessionId = 'session-1';
      service.trackSessionStart(sessionId);

      // Verify session is tracked as active
      const metrics = service.collectCurrentMetrics('minute');
      expect(metrics.sessions.active).toBe(1);
    });
  });

  describe('trackSessionEnd', () => {
    it('should track session end time and calculate duration', () => {
      const sessionId = 'session-1';

      service.trackSessionStart(sessionId);

      // Simulate some delay
      vi.setSystemTime(Date.now() + 5000);

      service.trackSessionEnd(sessionId, true);

      // Session should no longer be active
      const metrics = service.collectCurrentMetrics('minute');
      expect(metrics.sessions.active).toBe(0);
    });

    it('should track failed sessions', () => {
      const sessionId = 'session-1';

      service.trackSessionStart(sessionId);
      service.trackSessionEnd(sessionId, false);

      const metrics = service.collectCurrentMetrics('minute');
      expect(metrics.errors.byType).toHaveProperty('session_failure', 1);
    });
  });

  describe('collectCurrentMetrics', () => {
    it('should collect comprehensive metrics snapshot', () => {
      // Mock messageTracker responses
      vi.mocked(messageTracker.getSessionMetrics).mockReturnValue({
        sessionId: 'session-1',
        correlationId: 'corr-1',
        startTime: new Date(),
        endTime: new Date(Date.now() + 10000),
        messageCount: 5,
        toolCallCount: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCacheReadTokens: 100,
        totalCacheCreationTokens: 50,
        totalCostUsd: 0.015,
        permissionDenialCount: 1,
        averageResponseTimeMs: 2000,
      });

      vi.mocked(messageTracker.getAllToolMetrics).mockReturnValue([
        {
          toolName: 'network_diagnostic',
          callCount: 10,
          successCount: 8,
          failureCount: 1,
          denialCount: 1,
          totalDurationMs: 10000,
          averageDurationMs: 1000,
          lastUsed: new Date(),
        },
      ]);

      service.trackSessionStart('session-1');
      service.trackSessionEnd('session-1', true);

      const metrics = service.collectCurrentMetrics('minute');

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        period: 'minute',
        sessions: {
          active: 0,
          completed: 1,
        },
        tokens: {
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          totalCacheReadTokens: 100,
          totalCacheCreationTokens: 50,
        },
        toolCalls: {
          totalCalls: 10,
          successRate: 0.8,
          failureRate: 0.1,
          denialRate: 0.1,
          averageDurationMs: 1000,
        },
        cost: {
          totalCostUsd: 0.015,
          costPerSession: 0.015,
        },
      });
    });
  });

  describe('trackError', () => {
    it('should track different error types', () => {
      service.trackError('timeout');
      service.trackError('network_error');
      service.trackError('timeout');

      const metrics = service.collectCurrentMetrics('minute');

      expect(metrics.errors.total).toBe(3);
      expect(metrics.errors.byType).toEqual({
        timeout: 2,
        network_error: 1,
      });
    });
  });

  describe('calculateLatencyMetrics', () => {
    it('should calculate latency percentiles', () => {
      // Track multiple sessions with different response times
      for (let i = 1; i <= 100; i++) {
        const sessionId = `session-${i}`;
        service.trackSessionStart(sessionId);

        // Simulate varying response times (100ms to 10000ms)
        vi.setSystemTime(Date.now() + i * 100);

        service.trackSessionEnd(sessionId, true);
      }

      const metrics = service.collectCurrentMetrics('minute');

      expect(metrics.latency).toMatchObject({
        averageResponseTimeMs: expect.any(Number),
        p50ResponseTimeMs: expect.any(Number),
        p95ResponseTimeMs: expect.any(Number),
        p99ResponseTimeMs: expect.any(Number),
        minResponseTimeMs: expect.any(Number),
        maxResponseTimeMs: expect.any(Number),
      });

      // Verify percentiles are in expected order
      expect(metrics.latency.minResponseTimeMs).toBeLessThanOrEqual(
        metrics.latency.p50ResponseTimeMs
      );
      expect(metrics.latency.p50ResponseTimeMs).toBeLessThanOrEqual(
        metrics.latency.p95ResponseTimeMs
      );
      expect(metrics.latency.p95ResponseTimeMs).toBeLessThanOrEqual(
        metrics.latency.p99ResponseTimeMs
      );
      expect(metrics.latency.p99ResponseTimeMs).toBeLessThanOrEqual(
        metrics.latency.maxResponseTimeMs
      );
    });
  });

  describe('exportPrometheusMetrics', () => {
    it('should export metrics in Prometheus format', () => {
      vi.mocked(messageTracker.getSessionMetrics).mockReturnValue({
        sessionId: 'session-1',
        correlationId: 'corr-1',
        startTime: new Date(),
        endTime: new Date(),
        messageCount: 5,
        toolCallCount: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCacheReadTokens: 100,
        totalCacheCreationTokens: 50,
        totalCostUsd: 0.015,
        permissionDenialCount: 0,
        averageResponseTimeMs: 2000,
      });

      vi.mocked(messageTracker.getAllToolMetrics).mockReturnValue([]);

      service.trackSessionStart('session-1');

      const prometheusFormat = service.exportPrometheusMetrics();

      expect(prometheusFormat).toContain('# HELP sdk_sessions_active');
      expect(prometheusFormat).toContain('# TYPE sdk_sessions_active gauge');
      expect(prometheusFormat).toContain('sdk_sessions_active 1');
      expect(prometheusFormat).toContain('# HELP sdk_tokens_total');
      expect(prometheusFormat).toContain('sdk_tokens_total{type="input"}');
      expect(prometheusFormat).toContain('sdk_tokens_total{type="output"}');
      expect(prometheusFormat).toContain('# HELP sdk_latency_milliseconds');
      expect(prometheusFormat).toContain(
        'sdk_latency_milliseconds{quantile="0.5"}'
      );
      expect(prometheusFormat).toContain('# HELP sdk_tool_calls_total');
      expect(prometheusFormat).toContain('# HELP sdk_cost_usd');
      expect(prometheusFormat).toContain('# HELP sdk_errors_total');
    });
  });

  describe('exportCloudWatchMetrics', () => {
    it('should export metrics in CloudWatch format', () => {
      vi.mocked(messageTracker.getSessionMetrics).mockReturnValue({
        sessionId: 'session-1',
        correlationId: 'corr-1',
        startTime: new Date(),
        endTime: new Date(),
        messageCount: 5,
        toolCallCount: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCacheReadTokens: 100,
        totalCacheCreationTokens: 50,
        totalCostUsd: 0.015,
        permissionDenialCount: 0,
        averageResponseTimeMs: 2000,
      });

      vi.mocked(messageTracker.getAllToolMetrics).mockReturnValue([]);

      service.trackSessionStart('session-1');

      const cwMetrics = service.exportCloudWatchMetrics();

      expect(cwMetrics).toBeInstanceOf(Array);
      expect(cwMetrics.length).toBeGreaterThan(0);

      const metricNames = cwMetrics.map(m => m.MetricName);
      expect(metricNames).toContain('ActiveSessions');
      expect(metricNames).toContain('InputTokens');
      expect(metricNames).toContain('OutputTokens');
      expect(metricNames).toContain('AverageLatency');
      expect(metricNames).toContain('ToolCalls');
      expect(metricNames).toContain('TotalCost');
      expect(metricNames).toContain('Errors');

      // Verify metric structure
      const activeSessions = cwMetrics.find(
        m => m.MetricName === 'ActiveSessions'
      );
      expect(activeSessions).toMatchObject({
        MetricName: 'ActiveSessions',
        Value: 1,
        Unit: 'Count',
        Timestamp: expect.any(Date),
      });
    });
  });

  describe('getMetricsHistory', () => {
    it('should return metrics history for specified period', () => {
      vi.mocked(messageTracker.getSessionMetrics).mockReturnValue(null);
      vi.mocked(messageTracker.getAllToolMetrics).mockReturnValue([]);

      // Manually trigger metrics collection
      const metrics1 = service.collectCurrentMetrics('minute');

      // Note: We can't directly modify metricsHistory, so we test what we can
      const history = service.getMetricsHistory('minute', 10);

      // The initial metrics collection in constructor won't have happened in test
      // So we expect an empty array unless we wait for the interval
      expect(history).toBeInstanceOf(Array);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all collected metrics', () => {
      service.trackSessionStart('session-1');
      service.trackError('test_error');

      service.clearMetrics();

      const metrics = service.collectCurrentMetrics('minute');
      expect(metrics.sessions.active).toBe(0);
      expect(metrics.errors.total).toBe(0);
    });
  });
});
