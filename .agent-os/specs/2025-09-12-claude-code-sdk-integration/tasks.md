# Spec Tasks

## Tasks

- [x] 1. Define orchestrator prompts and SDK configuration
  - [x] 1.1 Draft analysis prompt templates with TypeScript interfaces
  - [x] 1.2 Configure SDK Options interface with safety defaults
  - [x] 1.3 Design MCP tool schemas using Zod for type safety

- [x] 2. Implement TypeScript SDK integration in `@aizen/api`
  - [x] 2.1 Install `@anthropic/claude-code-sdk` package and configure TypeScript types
  - [x] 2.2 Create `AIOrchestrator` service class with SDK query() integration
  - [x] 2.3 Implement streaming analysis with AsyncGenerator pattern
  - [x] 2.4 Build `canUseTool` permission handler for HITL workflow
  - [x] 2.5 Create message processing pipeline for SDK message types

- [x] 3. Build workflow APIs with SDK streaming
  - [x] 3.1 POST `/api/v1/ai/diagnostics/analyze` with AsyncGenerator SSE streaming
  - [x] 3.2 POST `/api/v1/ai/scripts/generate` using MCP tools
  - [x] 3.3 POST `/api/v1/ai/scripts/validate` with SDK validation
  - [x] 3.4 POST `/api/v1/ai/scripts/submit-for-approval` integrated with `canUseTool`
  - [x] 3.5 WS `/api/v1/ai/approval-stream` for real-time HITL approvals
  - [x] 3.6 GET `/api/v1/ai/mcp-tools` to list available SDK tools

- [x] 4. HITL integration with SDK permission system
  - [x] 4.1 WebSocket server for real-time approval requests from `canUseTool`
  - [x] 4.2 Approval UI integrated with SDK permission callbacks
  - [x] 4.3 Persist approval records with SDK message tracking
  - [x] 4.4 Real-time updates using SDK's streaming messages

- [x] 5. MCP tool development for network operations
  - [x] 5.1 Create `network_diagnostic` tool with Zod schemas
  - [x] 5.2 Implement `script_generator` tool with safety constraints
  - [x] 5.3 Build `validation_tool` for policy enforcement
  - [x] 5.4 Register tools via `createSdkMcpServer()`
  - [x] 5.5 Add tool risk scoring and approval requirements

- [x] 6. Safety with SDK permission controls
  - [x] 6.1 PII sanitization before SDK query() calls
  - [x] 6.2 Configure SDK `allowedTools` and `disallowedTools`
  - [x] 6.3 Implement `canUseTool` callback with policy validation
  - [x] 6.4 SDK permission denials tracking and audit
  - [x] 6.5 Test SDK's AbortError handling and signal propagation
  - [x] 6.6 Validate SDK message types with Zod runtime checks

- [x] 7. Execution handoff to device agent
  - [x] 7.1 Package approved scripts from MCP tool outputs
  - [x] 7.2 Create execution manifest with security constraints
  - [x] 7.3 Sign packages with ed25519 for device verification
  - [x] 7.4 Device agent integration with SDK-generated scripts
  - [x] 7.5 Result reporting back through SDK message pipeline

- [x] 8. Observability and documentation
  - [x] 8.1 SDK message tracking with correlation IDs
  - [x] 8.2 Metrics for SDK usage (tokens, latency, tool calls)
  - [x] 8.3 TypeScript API documentation with SDK types
  - [x] 8.4 Integration guide for SDK Options and MCP tools
  - [x] 8.5 Runbook for ANTHROPIC_API_KEY management
