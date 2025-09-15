# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-12-claude-code-sdk-integration/spec.md

## Architecture

- **Service**: Native TypeScript SDK integration directly in `@aizen/api` service (no sidecar needed)
- **SDK Client**: `@anthropic/claude-code-sdk` with AsyncGenerator streaming, permission callbacks, and MCP tool support
- **Data Flow**: device diagnostics → sanitization → SDK analysis → proposals → validation → HITL approval → device execution
- **Storage**: Supabase for session/approval records with real-time subscriptions; Redis for transient caches and WebSocket state
- **Observability**: Unified logging with SDK message tracking, correlation IDs, streaming metrics

## Safety Controls

- **PII Sanitization**: redact emails, phone numbers, IPs (public optional), MAC addresses, hostnames, and tokens
- **Policy Engine**: allow/deny for commands, file paths, network sockets; timeouts and max output size
- **Manifest**: interpreter, required env vars (none by default), timeout, working dir, and resource caps
- **Risk Scoring**: low/medium/high with rationale; high risk forces second approval path (future)

## SDK Integration Design

- **Query Configuration**:
  - Analysis mode: `permissionMode: 'plan'`, `allowedTools: []`, `maxTurns: 1`, streaming with partial messages
  - Script generation: `permissionMode: 'default'`, custom MCP tools with safety constraints, approvals via `canUseTool`
  - Validation: Built-in via `canUseTool` callback with policy enforcement
- **Security Policy Enforcement**:
  - Client `allowedTools` filtered: `requestedTools ∩ serverPolicyAllowedTools`
  - `permissionMode` restricted: only `'default'` or `'plan'` accepted from clients
  - All tools subject to server-side approval workflow regardless of client request
  - MCP servers configured server-side only, never exposed to clients
- **Permission Handler**: Async callback integrating with web portal for real-time approvals
- **Message Processing**: Type-safe handling of SDK messages:
  - `SDKPartialAssistantMessage`: Streaming updates when `includePartialMessages: true`
  - `SDKAssistantMessage`: Complete assistant responses
  - `SDKResultMessage`: Final summary with usage stats and duration
  - `SDKSystemMessage`: System initialization and status
- **MCP Tools**: Custom network diagnostic tools via `createSdkMcpServer()` with Zod schemas

## API Integration (Fastify with SDK)

- Register routes under `/api/v1/ai/*` with Supabase JWT auth
- Native streaming via SDK's AsyncGenerator pattern
- WebSocket support for real-time HITL approvals integrated with `canUseTool`
- SSE endpoints using SDK streaming: automatic event formatting from async iterators
- Type-safe request/response with Zod schemas matching SDK types
- Error handling for SDK-specific errors (AbortError, permission denials)

## Execution Handoff

- Package approved script: base64 payload, manifest, checksum (SHA-256)
- Store package reference; enqueue to device command queue with claim token
- Device agent validates checksum, enforces manifest, runs in restricted shell
- Results returned with logs and exit code; orchestrator updates approval record

## Device-Runner Isolation

The "smart hands" (Raspberry Pi device) executes only approved scripts inside a sandboxed runner with least privilege. The AI orchestrator must generate packages and manifests that conform to these constraints.

- Baseline (systemd-run sandbox):
  - User: dedicated non-root account `aizen-runner` (no sudo).
  - Workspace: ephemeral dir `/var/lib/aizen/runner/<job>` (wiped post-run).
  - Key properties: `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateDevices=yes`, `RestrictSUIDSGID=yes`, `RestrictAddressFamilies=AF_INET,AF_INET6`, `LockPersonality=yes`.
  - Resource limits: `CPUQuota=`, `MemoryMax=`, `TasksMax=`, output size cap, hard timeout.
  - Capabilities: minimal `CapabilityBoundingSet=` (e.g., add `CAP_NET_RAW` for ping; require explicit approval/policy for `CAP_NET_ADMIN`).
  - Example:
    `systemd-run --property=NoNewPrivileges=yes --property=ProtectSystem=strict --property=PrivateTmp=yes --property=CapabilityBoundingSet=CAP_NET_RAW --uid=aizen-runner --working-directory=/var/lib/aizen/runner/123 bash -lc './script.sh'`

- Upgrade paths (higher isolation):
  - Rootless Podman: read-only FS, `--cap-drop=ALL`, selectively `--cap-add=NET_RAW[,NET_ADMIN]`, `--pids-limit`, `--memory`, `--network=none|host`, bind-mount workspace.
  - nsjail/bubblewrap: user+mount namespaces, read-only root, seccomp, syscall allowlist, minimal deps. Suitable for low-footprint Pis.

- Risk classes and policies:
  - Diagnostics (low): unprivileged; optional `NET_RAW` only.
  - Remediation (medium): explicit approval; minimal added caps; strong rollback plan.
  - High-risk (deferred): second approver; stricter jail (Podman/nsjail) required.

- Integrity and audit:
  - Verify signature and SHA-256 digest before run; record interpreter, env allowlist, capabilities, timing, and resource usage; upload logs and exit status to cloud.

## Testing Strategy

- Unit tests: SDK message handlers, permission callbacks, MCP tool implementations
- Integration tests: End-to-end flows with SDK mock mode, real API tests with feature flags
- Type tests: Ensure all SDK types are properly handled and validated
- Red-team tests: Permission bypass attempts, prompt injection via tool inputs
- Load tests: Streaming performance, WebSocket connection limits, concurrent SDK queries

## TypeScript Implementation

```typescript
// packages/api/src/services/ai-orchestrator/index.ts
import { query, CanUseTool, SDKMessage, Options } from '@anthropic/claude-code-sdk';

export class AIOrchestrator {
  private readonly options: Partial<Options>;

  constructor(config: AIConfig) {
    this.options = {
      model: config.model,
      maxTurns: config.maxTurns,
      permissionMode: 'default',
      includePartialMessages: true,
      mcpServers: this.createMcpServers(), // Returns Record<string, McpServerConfig>
      canUseTool: this.createPermissionHandler(),
    };
  }

  private createMcpServers(): Record<string, McpServerConfig> {
    // Server-side configuration of MCP servers
    return {
      'network-tools': createSdkMcpServer({
        name: 'aizen-network-tools',
        version: '1.0.0',
        tools: [networkDiagnosticTool, scriptGeneratorTool],
      }),
    };
  }

  async *analyzeDiagnostics(data: DiagnosticData): AsyncGenerator<AnalysisEvent> {
    const sanitized = await this.sanitizePII(data);

    const q = query({
      prompt: this.buildPrompt(sanitized),
      options: { ...this.options, allowedTools: [] },
    });

    for await (const message of q) {
      yield this.processMessage(message);
    }
  }

  private createPermissionHandler(): CanUseTool {
    return async (toolName, input, { signal }) => {
      // Real-time HITL approval via WebSocket
      const approval = await this.requestApproval(toolName, input, signal);

      if (approval.approved) {
        return {
          behavior: 'allow',
          updatedInput: approval.sanitizedInput || input,
          updatedPermissions: approval.permissions,
        };
      }

      return {
        behavior: 'deny',
        message: approval.reason || 'User denied permission',
        interrupt: false,
      };
    };
  }
}
```

## Configuration

### Environment Variables

Environment variables map directly to SDK `Options` fields:

```bash
# Authentication
ANTHROPIC_API_KEY=sk-ant-...            # → apiKey (required for API usage)

# Model Configuration
CLAUDE_MODEL=claude-3-opus-20240229     # → model
CLAUDE_MAX_TURNS=3                      # → maxTurns
CLAUDE_MAX_THINKING_TOKENS=10000        # → maxThinkingTokens

# Permission & Tools
CLAUDE_PERMISSION_MODE=default          # → permissionMode ('default' | 'plan' only)
CLAUDE_ALLOWED_TOOLS=[]                 # → allowedTools (JSON array)
CLAUDE_DISALLOWED_TOOLS=[]              # → disallowedTools (JSON array)

# Optional Paths
CLAUDE_CODE_EXECUTABLE=/path/to/claude  # → pathToClaudeCodeExecutable (auto-detected)
```

- Claude CLI: Optional; SDK auto-detects if installed. Not required when using ANTHROPIC_API_KEY
- SDK Options: Configured via TypeScript `Options` interface with type safety
- MCP Servers: Dynamic registration of custom tools with runtime validation
- Secrets: Managed via `.env` with Supabase integration for secure storage
