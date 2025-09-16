# Claude Code SDK Integration API Reference

## Overview

This document provides a comprehensive TypeScript API reference for the Claude Code SDK integration in the Zen & Zen Support system.

## Core Services

### AIOrchestrator

The main service for managing AI interactions with the Claude Code SDK.

```typescript
class AIOrchestrator extends EventEmitter {
  // Execute diagnostic analysis with streaming support
  async *analyzeDiagnostics(
    prompt: NetworkDiagnosticPrompt,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void>

  // Generate remediation scripts with HITL approval
  async *generateRemediation(
    prompt: RemediationScriptPrompt,
    sessionId: string,
    canUseTool: CanUseTool,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void>

  // Analyze performance metrics
  async *analyzePerformance(
    prompt: PerformanceAnalysisPrompt,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void>

  // Perform security assessment
  async *analyzeSecurity(
    prompt: SecurityAssessmentPrompt,
    sessionId: string,
    correlationId?: string
  ): AsyncGenerator<SDKMessage, void>

  // Interrupt an active query
  async interruptQuery(sessionId: string): Promise<void>

  // Update permission mode for active query
  async updatePermissionMode(
    sessionId: string,
    mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  ): Promise<void>

  // Get usage statistics for a session
  getUsageStats(sessionId: string): ModelUsage | undefined

  // Cleanup resources
  async cleanup(): Promise<void>
}
```

### SDKMessageTracker

Service for tracking SDK messages with correlation IDs and session management.

```typescript
class SDKMessageTracker {
  // Track an SDK message with correlation ID
  trackMessage(
    message: SDKMessage,
    sessionId: string,
    correlationId: string
  ): TrackedMessage

  // Get all messages for a session
  getSessionMessages(sessionId: string): TrackedMessage[]

  // Get messages by correlation ID
  getMessagesByCorrelationId(correlationId: string): TrackedMessage[]

  // Get session metrics
  getSessionMetrics(sessionId: string): SessionMetrics | undefined

  // Get all tool metrics
  getAllToolMetrics(): ToolMetrics[]

  // Get tool metrics by name
  getToolMetrics(toolName: string): ToolMetrics | undefined

  // Track tool result
  trackToolResult(
    toolName: string,
    success: boolean,
    durationMs: number
  ): void

  // Export session data for audit
  exportSessionData(sessionId: string): {
    messages: TrackedMessage[]
    metrics: SessionMetrics | undefined
    toolMetrics: ToolMetrics[]
  }

  // Clear session data
  clearSession(sessionId: string): void

  // Clear all data
  clearAll(): void
}
```

### SDKMetricsService

Service for collecting and aggregating metrics from SDK usage.

```typescript
class SDKMetricsService extends EventEmitter {
  // Collect current metrics snapshot
  collectCurrentMetrics(
    period: 'minute' | 'hour' | 'day' = 'minute'
  ): AggregateMetrics

  // Track session start
  trackSessionStart(sessionId: string): void

  // Track session end
  trackSessionEnd(sessionId: string, success: boolean): void

  // Track error occurrence
  trackError(errorType: string): void

  // Export metrics in Prometheus format
  exportPrometheusMetrics(): string

  // Export metrics for CloudWatch
  exportCloudWatchMetrics(): Array<{
    MetricName: string
    Value: number
    Unit: string
    Timestamp: Date
  }>

  // Get metrics history
  getMetricsHistory(
    period: 'minute' | 'hour' | 'day' = 'minute',
    limit = 100
  ): AggregateMetrics[]

  // Clear all metrics
  clearMetrics(): void
}
```

## Type Definitions

### Message Types

```typescript
interface TrackedMessage {
  correlationId: string
  sessionId: string
  message: SDKMessage
  timestamp: Date
  messageNumber: number
  parentToolUseId?: string
}

interface SessionMetrics {
  sessionId: string
  correlationId: string
  startTime: Date
  endTime?: Date
  messageCount: number
  toolCallCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  totalCostUsd: number
  permissionDenialCount: number
  averageResponseTimeMs?: number
  lastMessageTimestamp?: Date
}

interface ToolMetrics {
  toolName: string
  callCount: number
  successCount: number
  failureCount: number
  denialCount: number
  totalDurationMs: number
  averageDurationMs: number
  lastUsed: Date
}
```

### Metrics Types

```typescript
interface TokenMetrics {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  inputTokenRate: number // tokens per minute
  outputTokenRate: number // tokens per minute
}

interface LatencyMetrics {
  averageResponseTimeMs: number
  p50ResponseTimeMs: number
  p95ResponseTimeMs: number
  p99ResponseTimeMs: number
  minResponseTimeMs: number
  maxResponseTimeMs: number
}

interface ToolCallMetrics {
  totalCalls: number
  successRate: number
  failureRate: number
  denialRate: number
  averageDurationMs: number
  callsPerMinute: number
  topTools: Array<{
    toolName: string
    callCount: number
    successRate: number
  }>
}

interface CostMetrics {
  totalCostUsd: number
  costPerSession: number
  costPerToken: number
  estimatedMonthlyCost: number
}

interface AggregateMetrics {
  timestamp: Date
  period: 'minute' | 'hour' | 'day'
  sessions: {
    active: number
    completed: number
    failed: number
    totalDurationMs: number
  }
  tokens: TokenMetrics
  latency: LatencyMetrics
  toolCalls: ToolCallMetrics
  cost: CostMetrics
  errors: {
    total: number
    byType: Record<string, number>
    permissionDenials: number
  }
}
```

### Prompt Types

```typescript
interface NetworkDiagnosticPrompt {
  type: 'diagnostic'
  input: {
    deviceId: string
    deviceType: string
    symptoms: string[]
    diagnosticData: {
      pingResults: unknown
      traceroute: unknown
      dnsResolution: unknown
      networkInterfaces: unknown
      connectionStatus: unknown
    }
  }
}

interface RemediationScriptPrompt {
  type: 'remediation'
  input: {
    issue: string
    rootCause: string
    targetDevice: Record<string, unknown>
    constraints: {
      maxExecutionTime: number
      rollbackRequired: boolean
    }
    proposedActions?: Array<{ description: string }>
  }
}

interface PerformanceAnalysisPrompt {
  type: 'performance'
  input: {
    metrics: {
      bandwidth?: unknown
      latency?: unknown
      throughput?: unknown
      packetLoss?: unknown
      utilization?: unknown
      jitter?: unknown
    }
    timeRange: {
      start: string
      end: string
    }
    thresholds?: {
      latencyMs: number
      packetLossPercent: number
      utilizationPercent: number
    }
    baseline?: unknown
  }
}

interface SecurityAssessmentPrompt {
  type: 'security'
  input: {
    scanResults: {
      openPorts: unknown
      vulnerabilities?: unknown[]
    }
    complianceRequirements?: unknown[]
  }
}
```

## API Endpoints

### Metrics Endpoints

#### GET `/api/v1/ai/metrics/current`

Get current AI SDK metrics snapshot.

**Query Parameters:**
- `period` (optional): `'minute' | 'hour' | 'day'` (default: `'minute'`)

**Response:** `AggregateMetrics`

```typescript
// Example usage
const response = await fetch('/api/v1/ai/metrics/current?period=hour')
const metrics: AggregateMetrics = await response.json()
```

#### GET `/api/v1/ai/metrics/history`

Get historical AI SDK metrics.

**Query Parameters:**
- `period` (optional): `'minute' | 'hour' | 'day'` (default: `'minute'`)
- `limit` (optional): number (1-1000, default: 100)

**Response:** `AggregateMetrics[]`

#### GET `/api/v1/ai/metrics/prometheus`

Get metrics in Prometheus format.

**Response:** Plain text in Prometheus format

#### GET `/api/v1/ai/metrics/cloudwatch`

Get metrics in CloudWatch format.

**Response:** CloudWatch metric array

```typescript
interface CloudWatchMetric {
  MetricName: string
  Value: number
  Unit: string
  Timestamp: Date
}
```

#### GET `/api/v1/ai/metrics/health`

Check health of metrics service.

**Response:**
```typescript
{
  status: 'healthy'
  timestamp: string
  activeSessions: number
}
```

## Events

The AIOrchestrator emits the following events:

```typescript
// Session initialization
orchestrator.on('session:init', (data: {
  sessionId: string
  correlationId: string
  model: string
  tools: string[]
  mcpServers: Array<{ name: string; status: string }>
  permissionMode: string
}) => void)

// Assistant message received
orchestrator.on('assistant:message', (data: {
  sessionId: string
  correlationId: string
  message: SDKAssistantMessage
}) => void)

// Tool use detected
orchestrator.on('tool:use', (data: {
  sessionId: string
  correlationId: string
  toolName: string
  toolInput: unknown
  toolId: string
  timestamp: number
}) => void)

// Permission denied
orchestrator.on('permission:denied', (data: {
  sessionId: string
  correlationId: string
  denials: Array<{
    tool_name: string
    tool_use_id: string
    tool_input: unknown
  }>
}) => void)

// Query completed
orchestrator.on('query:complete', (data: {
  sessionId: string
  correlationId: string
  result: string
  usage: Usage
  cost: number
}) => void)

// Query error
orchestrator.on('query:error', (data: {
  sessionId: string
  correlationId: string
  errorType?: string
  error?: unknown
  usage?: Usage
}) => void)

// Query aborted
orchestrator.on('query:aborted', (data: {
  sessionId: string
  correlationId: string
}) => void)

// Stream partial message
orchestrator.on('stream:partial', (data: {
  sessionId: string
  correlationId: string
  message: SDKPartialAssistantMessage
}) => void)

// Usage update
orchestrator.on('usage:update', (data: {
  sessionId: string
  model: string
  usage: ModelUsage
}) => void)
```

## Usage Examples

### Basic Diagnostic Analysis

```typescript
import { AIOrchestrator } from './ai/services/ai-orchestrator.service'
import { generateCorrelationId } from './utils/correlation-id'

const orchestrator = new AIOrchestrator()

const diagnosticPrompt: NetworkDiagnosticPrompt = {
  type: 'diagnostic',
  input: {
    deviceId: 'device-001',
    deviceType: 'router',
    symptoms: ['slow connection', 'intermittent drops'],
    diagnosticData: {
      pingResults: { /* ... */ },
      traceroute: { /* ... */ },
      dnsResolution: { /* ... */ },
      networkInterfaces: { /* ... */ },
      connectionStatus: 'partial'
    }
  }
}

const sessionId = 'session-123'
const correlationId = generateCorrelationId()

// Stream diagnostic results
for await (const message of orchestrator.analyzeDiagnostics(
  diagnosticPrompt,
  sessionId,
  correlationId
)) {
  console.log('Received message:', message.type)
  // Process message
}
```

### Tracking Metrics

```typescript
import { metricsService } from './ai/services/sdk-metrics.service'

// Track session lifecycle
const sessionId = 'session-456'
metricsService.trackSessionStart(sessionId)

// ... perform operations ...

metricsService.trackSessionEnd(sessionId, true)

// Get current metrics
const metrics = metricsService.collectCurrentMetrics('hour')
console.log('Active sessions:', metrics.sessions.active)
console.log('Total tokens:', metrics.tokens.totalInputTokens + metrics.tokens.totalOutputTokens)
console.log('Average latency:', metrics.latency.averageResponseTimeMs, 'ms')

// Export for monitoring
const prometheusData = metricsService.exportPrometheusMetrics()
const cloudWatchData = metricsService.exportCloudWatchMetrics()
```

### Message Tracking with Correlation IDs

```typescript
import { messageTracker } from './ai/services/sdk-message-tracker.service'

// Track messages
const message: SDKMessage = { /* ... */ }
const tracked = messageTracker.trackMessage(message, sessionId, correlationId)

// Get session history
const sessionMessages = messageTracker.getSessionMessages(sessionId)
console.log(`Session has ${sessionMessages.length} messages`)

// Get metrics for session
const sessionMetrics = messageTracker.getSessionMetrics(sessionId)
if (sessionMetrics) {
  console.log('Token usage:', {
    input: sessionMetrics.totalInputTokens,
    output: sessionMetrics.totalOutputTokens,
    cost: sessionMetrics.totalCostUsd
  })
}

// Export for audit
const auditData = messageTracker.exportSessionData(sessionId)
```

## Error Handling

```typescript
try {
  for await (const message of orchestrator.analyzeDiagnostics(prompt, sessionId)) {
    // Process message
  }
} catch (error) {
  if (error.message.includes('abort')) {
    console.log('Query was aborted')
  } else {
    console.error('Query failed:', error)
    metricsService.trackError('query_failure')
  }
} finally {
  // Cleanup
  await orchestrator.cleanup()
}
```

## Best Practices

1. **Always use correlation IDs**: Pass correlation IDs through all service calls for complete tracing
2. **Track metrics lifecycle**: Call `trackSessionStart()` and `trackSessionEnd()` for accurate metrics
3. **Handle streaming properly**: Use try-catch-finally blocks with async generators
4. **Clean up resources**: Call `cleanup()` methods when done
5. **Monitor permission denials**: Track and analyze permission denial patterns
6. **Export metrics regularly**: Set up periodic exports to your monitoring system
7. **Implement proper error handling**: Track errors for observability
8. **Use typed prompts**: Leverage TypeScript interfaces for type safety

## Configuration

The SDK integration uses the following configuration:

```typescript
// SDK Options Factory
class SDKOptionsFactory {
  static createDiagnosticOptions(): Partial<Options>
  static createRemediationOptions(): Partial<Options>
  static createDefaultOptions(apiKey?: string): Partial<Options>
}

// Default options include:
{
  model: process.env.ANTHROPIC_MODEL || 'claude-3.5-sonnet',
  maxThinkingTokens: 25000,
  maxTurns: 3,
  permissionMode: 'default',
  allowedTools: [...],
  disallowedTools: ['dangerous_tool'],
  includePartialMessages: true,
  mcpServers: {
    'network-tools': networkMcpServer
  }
}
```

## See Also

- [Claude Code SDK Documentation](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript)
- [Integration Guide](./sdk-integration-guide.md)
- [API Key Management Runbook](./api-key-runbook.md)
- [MCP Tools Reference](./mcp-tools-reference.md)