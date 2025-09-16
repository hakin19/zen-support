# Claude Code SDK Integration Guide

## Introduction

This guide provides step-by-step instructions for integrating the Claude Code SDK into your Zen & Zen Support system, including configuration of SDK Options and creation of MCP tools.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Basic Configuration](#basic-configuration)
4. [SDK Options Configuration](#sdk-options-configuration)
5. [Creating MCP Tools](#creating-mcp-tools)
6. [Implementing HITL Workflow](#implementing-hitl-workflow)
7. [Streaming Integration](#streaming-integration)
8. [Error Handling](#error-handling)
9. [Testing](#testing)
10. [Production Checklist](#production-checklist)

## Prerequisites

Before starting the integration:

1. **Node.js 20+ LTS** installed
2. **TypeScript 5.x** configured
3. **Anthropic API Key** obtained from Anthropic Console
4. **Supabase** project configured for authentication and storage
5. **Redis** instance for session management

## Installation

### Step 1: Install the SDK

```bash
npm install @anthropic-ai/claude-code
```

### Step 2: Install supporting packages

```bash
npm install zod ioredis @supabase/supabase-js
```

### Step 3: Configure TypeScript

Update your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Basic Configuration

### Environment Variables

Create a `.env` file:

```bash
# Claude API Configuration
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-3.5-sonnet
ANTHROPIC_MAX_THINKING_TOKENS=25000
ANTHROPIC_MAX_TURNS=3

# Feature Flags
ENABLE_HITL_APPROVAL=true
ENABLE_STREAMING=true
ENABLE_MCP_TOOLS=true

# Security
PII_SANITIZATION_ENABLED=true
MAX_EXECUTION_TIME_MS=300000
```

### Basic SDK Setup

```typescript
import { query, type Options } from '@anthropic-ai/claude-code'

const options: Options = {
  model: process.env.ANTHROPIC_MODEL || 'claude-3.5-sonnet',
  maxThinkingTokens: parseInt(process.env.ANTHROPIC_MAX_THINKING_TOKENS || '25000'),
  maxTurns: parseInt(process.env.ANTHROPIC_MAX_TURNS || '3'),
  permissionMode: 'default',
}

// Basic query
const response = query({
  prompt: 'Analyze network connectivity issues',
  options,
})

for await (const message of response) {
  console.log('Message:', message.type)
}
```

## SDK Options Configuration

### Creating the Options Factory

```typescript
// sdk-options.config.ts
import type { Options, McpServerConfig } from '@anthropic-ai/claude-code'
import { networkMcpServer } from './network-mcp-server'

export class SDKOptionsFactory {
  /**
   * Create options for diagnostic analysis
   */
  static createDiagnosticOptions(): Partial<Options> {
    return {
      ...this.createDefaultOptions(),
      maxTurns: 2, // Limit turns for diagnostics
      permissionMode: 'default',
      allowedTools: [
        'network_diagnostic',
        'ping_test',
        'traceroute',
        'dns_lookup',
      ],
      disallowedTools: [
        'script_executor', // Don't allow execution during diagnostics
      ],
    }
  }

  /**
   * Create options for remediation with HITL
   */
  static createRemediationOptions(): Partial<Options> {
    return {
      ...this.createDefaultOptions(),
      maxTurns: 5, // More turns for complex remediation
      permissionMode: 'default',
      allowedTools: [
        'network_diagnostic',
        'script_generator',
        'validation_tool',
        'rollback_planner',
      ],
      // canUseTool will be provided at runtime
    }
  }

  /**
   * Create default options
   */
  static createDefaultOptions(apiKey?: string): Partial<Options> {
    return {
      model: process.env.ANTHROPIC_MODEL || 'claude-3.5-sonnet',
      maxThinkingTokens: 25000,
      maxTurns: 3,
      permissionMode: 'default',
      includePartialMessages: true,
      mcpServers: {
        'network-tools': networkMcpServer,
      },
      env: {
        ANTHROPIC_API_KEY: apiKey || process.env.ANTHROPIC_API_KEY,
      },
    }
  }
}
```

### Advanced Options Configuration

```typescript
// Advanced configuration with all options
const advancedOptions: Options = {
  // Model configuration
  model: 'claude-3.5-sonnet',
  fallbackModel: 'claude-3.5-haiku',

  // Token limits
  maxThinkingTokens: 25000,
  maxTurns: 5,

  // Permission configuration
  permissionMode: 'default',
  canUseTool: async (toolName, input, { signal, suggestions }) => {
    // Custom permission logic
    if (toolName === 'dangerous_tool') {
      return {
        behavior: 'deny',
        message: 'This tool requires admin approval',
      }
    }
    return { behavior: 'allow', updatedInput: input }
  },

  // Tool configuration
  allowedTools: ['tool1', 'tool2'],
  disallowedTools: ['dangerous_tool'],

  // MCP servers
  mcpServers: {
    'network': networkServer,
    'security': securityServer,
  },

  // Execution environment
  cwd: '/workspace',
  env: {
    CUSTOM_VAR: 'value',
  },

  // Streaming configuration
  includePartialMessages: true,

  // Abort handling
  abortController: new AbortController(),
}
```

## Creating MCP Tools

### Basic MCP Tool Structure

```typescript
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-code'
import { z } from 'zod'

// Define the tool
const networkDiagnosticTool = tool(
  'network_diagnostic',
  'Perform network diagnostics on target device',
  z.object({
    deviceId: z.string().describe('Target device identifier'),
    testType: z.enum(['ping', 'traceroute', 'dns']).describe('Type of test'),
    target: z.string().optional().describe('Target address for test'),
  }),
  async (args, extra) => {
    // Tool implementation
    const { deviceId, testType, target } = args

    // Perform diagnostic
    const result = await performNetworkTest(deviceId, testType, target)

    // Return MCP-compliant result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    }
  }
)

// Create MCP server
const networkMcpServer = createSdkMcpServer({
  name: 'network-tools',
  version: '1.0.0',
  tools: [networkDiagnosticTool],
})
```

### Advanced MCP Tool with Risk Scoring

```typescript
const scriptGeneratorTool = tool(
  'script_generator',
  'Generate remediation scripts for network issues',
  z.object({
    issue: z.string().describe('Description of the issue'),
    targetDevice: z.object({
      id: z.string(),
      type: z.string(),
      os: z.string(),
    }).describe('Target device information'),
    constraints: z.object({
      maxExecutionTime: z.number().default(300),
      rollbackRequired: z.boolean().default(true),
      riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
    }).optional(),
  }),
  async (args, extra) => {
    // Check risk level
    const riskLevel = args.constraints?.riskLevel || 'medium'

    if (riskLevel === 'high') {
      // Require additional approval
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              requiresApproval: true,
              reason: 'High-risk operation requires manual approval',
              script: generateScript(args),
            }),
          },
        ],
      }
    }

    // Generate safe script
    const script = await generateSafeScript(args)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            script,
            estimatedDuration: args.constraints?.maxExecutionTime,
            rollbackScript: args.constraints?.rollbackRequired
              ? generateRollbackScript(args)
              : null,
          }),
        },
      ],
    }
  }
)
```

### Validation Tool

```typescript
const validationTool = tool(
  'validation_tool',
  'Validate scripts against security policies',
  z.object({
    script: z.string().describe('Script to validate'),
    policies: z.array(z.string()).optional().describe('Policies to check'),
  }),
  async (args) => {
    const violations = []

    // Check for dangerous commands
    const dangerousCommands = ['rm -rf', 'format', 'del /f']
    for (const cmd of dangerousCommands) {
      if (args.script.includes(cmd)) {
        violations.push(`Dangerous command detected: ${cmd}`)
      }
    }

    // Check for credential exposure
    if (/password\s*=\s*["'].*["']/i.test(args.script)) {
      violations.push('Potential credential exposure detected')
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            valid: violations.length === 0,
            violations,
            riskScore: violations.length * 25,
          }),
        },
      ],
    }
  }
)
```

## Implementing HITL Workflow

### Permission Handler Implementation

```typescript
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-code'

export class HITLPermissionHandler {
  private approvalWebSocket: WebSocket
  private pendingApprovals = new Map<string, Promise<boolean>>()

  createCanUseTool(sessionId: string): CanUseTool {
    return async (toolName, input, { signal, suggestions }) => {
      // Check tool risk level
      const riskLevel = this.assessToolRisk(toolName, input)

      if (riskLevel === 'low') {
        // Auto-approve low-risk tools
        return {
          behavior: 'allow',
          updatedInput: input,
        }
      }

      if (riskLevel === 'critical') {
        // Auto-deny critical operations
        return {
          behavior: 'deny',
          message: 'This operation is not permitted',
        }
      }

      // Request user approval
      const approved = await this.requestUserApproval(
        sessionId,
        toolName,
        input,
        signal
      )

      if (approved) {
        return {
          behavior: 'allow',
          updatedInput: input,
        }
      } else {
        return {
          behavior: 'deny',
          message: 'User denied permission',
          interrupt: true, // Stop execution
        }
      }
    }
  }

  private assessToolRisk(
    toolName: string,
    input: unknown
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Risk assessment logic
    const highRiskTools = ['script_executor', 'config_modifier']
    const criticalTools = ['system_shutdown', 'data_deletion']

    if (criticalTools.includes(toolName)) return 'critical'
    if (highRiskTools.includes(toolName)) return 'high'

    // Check input for risky patterns
    const inputStr = JSON.stringify(input)
    if (inputStr.includes('sudo') || inputStr.includes('admin')) {
      return 'high'
    }

    return 'medium'
  }

  private async requestUserApproval(
    sessionId: string,
    toolName: string,
    input: unknown,
    signal: AbortSignal
  ): Promise<boolean> {
    const approvalId = generateId()

    // Send approval request via WebSocket
    this.approvalWebSocket.send(JSON.stringify({
      type: 'approval_request',
      approvalId,
      sessionId,
      toolName,
      input,
      timestamp: new Date().toISOString(),
    }))

    // Wait for approval
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false) // Timeout = deny
      }, 30000) // 30 second timeout

      // Listen for abort
      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        resolve(false)
      })

      // Store resolver for WebSocket response
      this.pendingApprovals.set(approvalId, new Promise((approvalResolve) => {
        // This will be resolved when WebSocket receives response
        approvalResolve(true)
      }))
    })
  }
}
```

## Streaming Integration

### Implementing Streaming Endpoints

```typescript
import { FastifyInstance } from 'fastify'

export function setupStreamingEndpoints(app: FastifyInstance) {
  app.post('/api/v1/ai/stream', async (request, reply) => {
    const { prompt, sessionId } = request.body
    const correlationId = extractCorrelationId(request)

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Correlation-ID': correlationId,
    })

    const orchestrator = new AIOrchestrator()

    try {
      // Stream messages
      for await (const message of orchestrator.analyzeDiagnostics(
        prompt,
        sessionId,
        correlationId
      )) {
        // Send SSE event
        reply.raw.write(`data: ${JSON.stringify(message)}\n\n`)

        // Track message
        messageTracker.trackMessage(message, sessionId, correlationId)
      }

      // Send completion event
      reply.raw.write('event: complete\ndata: {}\n\n')
    } catch (error) {
      // Send error event
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })
}
```

### WebSocket Streaming

```typescript
import { WebSocket } from 'ws'

export function setupWebSocketStreaming(ws: WebSocket, sessionId: string) {
  const orchestrator = new AIOrchestrator()
  const correlationId = generateCorrelationId()

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString())

    if (message.type === 'start_analysis') {
      try {
        for await (const sdkMessage of orchestrator.analyzeDiagnostics(
          message.prompt,
          sessionId,
          correlationId
        )) {
          ws.send(JSON.stringify({
            type: 'sdk_message',
            message: sdkMessage,
            correlationId,
          }))
        }

        ws.send(JSON.stringify({
          type: 'analysis_complete',
          correlationId,
        }))
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message,
          correlationId,
        }))
      }
    }
  })
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
class SDKErrorHandler {
  handleError(error: unknown, context: {
    sessionId: string
    correlationId: string
    operation: string
  }): void {
    // Log error with context
    console.error('SDK Error:', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
      } : error,
    })

    // Track metrics
    metricsService.trackError(this.categorizeError(error))

    // Determine if retryable
    if (this.isRetryable(error)) {
      this.scheduleRetry(context)
    }

    // Send notification if critical
    if (this.isCritical(error)) {
      this.sendAlert(error, context)
    }
  }

  private categorizeError(error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('abort')) return 'user_abort'
    if (errorMessage.includes('timeout')) return 'timeout'
    if (errorMessage.includes('rate limit')) return 'rate_limit'
    if (errorMessage.includes('permission')) return 'permission_denied'
    if (errorMessage.includes('network')) return 'network_error'

    return 'unknown_error'
  }

  private isRetryable(error: unknown): boolean {
    const retryableErrors = ['network_error', 'timeout', 'rate_limit']
    return retryableErrors.includes(this.categorizeError(error))
  }

  private isCritical(error: unknown): boolean {
    const criticalErrors = ['permission_denied', 'authentication_failed']
    return criticalErrors.includes(this.categorizeError(error))
  }
}
```

## Testing

### Unit Testing MCP Tools

```typescript
import { describe, it, expect } from 'vitest'

describe('Network Diagnostic Tool', () => {
  it('should perform ping test', async () => {
    const result = await networkDiagnosticTool.handler(
      {
        deviceId: 'device-001',
        testType: 'ping',
        target: '8.8.8.8',
      },
      {}
    )

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('success')
    expect(data).toHaveProperty('latency')
  })
})
```

### Integration Testing

```typescript
describe('SDK Integration', () => {
  it('should complete diagnostic analysis', async () => {
    const orchestrator = new AIOrchestrator()
    const messages = []

    for await (const message of orchestrator.analyzeDiagnostics(
      testPrompt,
      'test-session',
      'test-correlation'
    )) {
      messages.push(message)
    }

    // Verify message flow
    expect(messages[0].type).toBe('system')
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'assistant' })
    )
    expect(messages[messages.length - 1].type).toBe('result')
  })
})
```

## Production Checklist

### Pre-deployment Checklist

- [ ] **API Key Management**
  - [ ] API key stored securely (not in code)
  - [ ] Key rotation schedule established
  - [ ] Backup key configured

- [ ] **Security**
  - [ ] PII sanitization enabled and tested
  - [ ] HITL approval workflow tested
  - [ ] Tool permissions configured
  - [ ] Rate limiting implemented

- [ ] **Monitoring**
  - [ ] Metrics collection enabled
  - [ ] Prometheus/CloudWatch exports configured
  - [ ] Alerting thresholds set
  - [ ] Log aggregation configured

- [ ] **Error Handling**
  - [ ] All error paths tested
  - [ ] Retry logic implemented
  - [ ] Circuit breakers configured
  - [ ] Graceful degradation tested

- [ ] **Performance**
  - [ ] Connection pooling configured
  - [ ] Timeout values optimized
  - [ ] Memory limits set
  - [ ] Streaming tested under load

- [ ] **Compliance**
  - [ ] Audit logging enabled
  - [ ] Data retention policies configured
  - [ ] GDPR/privacy compliance verified
  - [ ] Security review completed

### Deployment Configuration

```typescript
// production.config.ts
export const productionConfig = {
  sdk: {
    model: 'claude-3.5-sonnet',
    maxThinkingTokens: 25000,
    maxTurns: 5,
    timeout: 300000, // 5 minutes
  },
  security: {
    requireHITL: true,
    piiSanitization: true,
    maxRequestsPerMinute: 10,
  },
  monitoring: {
    metricsInterval: 60000, // 1 minute
    alertingEnabled: true,
    logLevel: 'info',
  },
  resilience: {
    retryAttempts: 3,
    retryDelay: 1000,
    circuitBreakerThreshold: 5,
  },
}
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**
   - Implement exponential backoff
   - Use multiple API keys with rotation
   - Cache responses when appropriate

2. **Memory Issues**
   - Stream large responses instead of buffering
   - Clear message tracker periodically
   - Implement session limits

3. **Connection Timeouts**
   - Adjust timeout values based on operation type
   - Implement keep-alive for WebSockets
   - Use connection pooling

4. **Permission Denials**
   - Review tool risk assessments
   - Audit HITL approval patterns
   - Adjust permission policies

## Next Steps

1. Review the [API Reference](./sdk-api-reference.md)
2. Set up [API Key Management](./api-key-runbook.md)
3. Configure monitoring dashboards
4. Run integration tests
5. Deploy to staging environment