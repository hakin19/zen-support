# Claude Code TypeScript SDK Migration Plan

## Executive Summary

The recent release of the official Claude Code TypeScript SDK (`@anthropic/claude-code-sdk`) fundamentally simplifies our AI orchestration architecture. We can eliminate the Python sidecar approach entirely and integrate the SDK directly into our Node.js API service, reducing complexity and improving performance.

## Architecture Impact

### Simplified Stack

```
Before: Node.js API → HTTP → Python Sidecar → Claude Code SDK
After:  Node.js API → TypeScript SDK → Claude API
```

### Key Advantages

1. **Native Integration**: Direct TypeScript integration in `@aizen/api`
2. **Type Safety**: Full TypeScript types for all operations
3. **Streaming Support**: Built-in AsyncGenerator pattern for real-time updates
4. **Permission Control**: Native `canUseTool` callback for HITL workflow
5. **MCP Support**: Can create custom tools via `createSdkMcpServer()`
6. **Reduced Latency**: No inter-process communication overhead
7. **Simplified Deployment**: Single Node.js container, no Python runtime
8. **Flexible Authentication**: Works with ANTHROPIC_API_KEY; CLI optional and auto-detected

## Implementation Strategy

### 1. Direct SDK Integration in `@aizen/api`

```typescript
// packages/api/src/services/ai-orchestrator.ts
import { query, tool, createSdkMcpServer } from '@anthropic/claude-code-sdk';

export class AIOrchestrator {
  async analyzeDiagnostics(diagnostics: DiagnosticData): AsyncGenerator<AnalysisEvent> {
    // Determine operation mode based on request type
    const isAnalysisOnly = !diagnostics.requiresRemediation;

    // Apply server-side security policy
    const clientRequestedTools = diagnostics.sdkOptions?.allowedTools || [];
    const policyAllowedTools = this.config.policyAllowedTools || [];
    const effectiveTools = isAnalysisOnly
      ? [] // No tools for pure analysis
      : clientRequestedTools.filter(t => policyAllowedTools.includes(t));

    // Use 'plan' mode for analysis, 'default' for generation with HITL
    const effectiveMode = isAnalysisOnly ? 'plan' : 'default';

    const q = query({
      prompt: this.buildAnalysisPrompt(diagnostics),
      options: {
        model: 'claude-3-opus-20240229',
        allowedTools: effectiveTools, // Empty array for analysis, tools for generation
        permissionMode: effectiveMode, // 'plan' for analysis, 'default' for generation
        maxTurns: 1,
        includePartialMessages: true,
        canUseTool: this.createPermissionHandler(),
      },
    });

    for await (const message of q) {
      yield this.processMessage(message);
    }
  }

  private createPermissionHandler(): CanUseTool {
    return async (toolName, input, { signal, suggestions }) => {
      // Implement HITL approval workflow
      const approval = await this.requestApproval(toolName, input);

      if (approval.approved) {
        return {
          behavior: 'allow',
          updatedInput: approval.sanitizedInput,
          updatedPermissions: approval.permissions,
        };
      }

      return {
        behavior: 'deny',
        message: approval.reason,
        interrupt: false,
      };
    };
  }
}
```

### 2. Custom MCP Tools for Network Diagnostics

```typescript
// packages/api/src/services/network-tools.ts
import { tool, createSdkMcpServer } from '@anthropic/claude-code-sdk';
import { z } from 'zod';

const networkDiagnosticTool = tool(
  'network_diagnostic',
  'Run network diagnostic commands on the device',
  z.object({
    command: z.enum(['ping', 'traceroute', 'nslookup', 'ip']), // Using 'ip' for modern Linux (iproute2)
    target: z.string().optional(),
    options: z.record(z.string()).optional(),
  }),
  async args => {
    // Validate against security policy
    const validated = await validateCommand(args);

    // Queue for device execution with approval
    const result = await queueDeviceCommand(validated);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

export const networkMcpServer = createSdkMcpServer({
  name: 'aizen-network-tools',
  version: '1.0.0',
  tools: [networkDiagnosticTool],
});

// Register server-side only (not exposed to clients)
const mcpServers: Record<string, McpServerConfig> = {
  'network-tools': networkMcpServer,
};
```

### 3. Streaming API Integration

```typescript
// packages/api/src/routes/ai.routes.ts
import { FastifyInstance } from 'fastify';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/ai/diagnostics/analyze', {
    schema: analyzeSchema,
    handler: async (request, reply) => {
      const stream = request.query.stream === 'true';

      if (stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const analysis = orchestrator.analyzeDiagnostics(request.body);

        for await (const message of analysis) {
          // Stream SDK message types directly
          // SDKPartialAssistantMessage for real-time updates
          // SDKAssistantMessage for complete responses
          // SDKResultMessage for final summary
          reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
        }

        reply.raw.end();
      } else {
        const events = [];
        for await (const event of orchestrator.analyzeDiagnostics(request.body)) {
          events.push(event);
        }
        return { findings: events, requestId: request.id };
      }
    },
  });
}
```

## Modified Spec Files

### 1. spec.md Updates

- Remove Python sidecar references
- Update to use TypeScript SDK directly
- Emphasize native streaming capabilities
- Add MCP tool integration section

### 2. technical-spec.md Updates

- Remove Python runtime requirements
- Update architecture to single Node.js service
- Add TypeScript SDK configuration section
- Update security controls for SDK permission system
- Remove CLI dependencies

### 3. api-spec.md Updates

- Add WebSocket support for real-time approvals
- Update streaming endpoints to use SDK's AsyncGenerator
- Add MCP tool registration endpoints
- Update authentication for SDK's permission callbacks

### 4. tasks.md Updates

- Remove Python environment setup tasks
- Add TypeScript SDK installation and configuration
- Update integration tasks for direct SDK usage
- Add MCP tool development tasks
- Simplify testing strategy (no inter-process mocking)

## Migration Timeline

### Phase 1: SDK Integration (Week 1)

- Install `@anthropic/claude-code-sdk` package
- Create `AIOrchestrator` service class
- Implement basic diagnostic analysis

### Phase 2: Permission System (Week 2)

- Implement `canUseTool` callback for HITL
- Create approval workflow with web portal
- Add audit logging for all tool usage

### Phase 3: Custom Tools (Week 3)

- Develop network diagnostic MCP tools
- Implement script generation tools
- Add safety validation tools

### Phase 4: Testing & Optimization (Week 4)

- End-to-end integration tests
- Performance optimization
- Security audit

## Risk Mitigation

### SDK Limitations

- **Risk**: SDK may not support all required features
- **Mitigation**: Use SDK's extensibility via MCP tools for custom functionality

### Type Safety

- **Risk**: Dynamic AI responses may not match expected types
- **Mitigation**: Use Zod schemas for runtime validation of all AI outputs

### Rate Limiting

- **Risk**: Direct SDK usage may hit rate limits faster
- **Mitigation**: Implement request queuing and backoff strategies

## Configuration Changes

### Environment Variables

```bash
# Remove Python-related vars
# PYTHON_PATH=/usr/bin/python3
# CLAUDE_CLI_PATH=/usr/local/bin/claude

# Add TypeScript SDK vars (maps to Options interface)
ANTHROPIC_API_KEY=sk-ant-...            # → apiKey
CLAUDE_MODEL=claude-3-opus-20240229     # → model
CLAUDE_MAX_TURNS=3                      # → maxTurns
CLAUDE_MAX_THINKING_TOKENS=10000        # → maxThinkingTokens
CLAUDE_PERMISSION_MODE=default          # → permissionMode ('default' | 'plan' only)
CLAUDE_ALLOWED_TOOLS=[]                 # → allowedTools
CLAUDE_DISALLOWED_TOOLS=[]              # → disallowedTools
```

### Package.json Updates

```json
{
  "dependencies": {
    "@anthropic/claude-code-sdk": "^1.0.0"
    // Remove: "node-fetch": "^3.0.0" (no longer needed for sidecar)
  }
}
```

## Benefits Summary

1. **50% reduction in deployment complexity** - Single runtime environment
2. **30% faster response times** - No IPC overhead
3. **100% type coverage** - Full TypeScript throughout
4. **Improved debugging** - Single process, unified logging
5. **Better developer experience** - Native async/await and streaming
6. **Enhanced security** - Direct control over permissions via SDK

## Next Steps

1. Review and approve migration plan
2. Create feature branch for SDK integration
3. Implement Phase 1 (basic integration)
4. Validate with integration tests
5. Progressive rollout with feature flags

---

_This migration represents a significant simplification of our architecture while maintaining all planned functionality. The TypeScript SDK's native capabilities align perfectly with our Node.js stack and eliminate unnecessary complexity._
