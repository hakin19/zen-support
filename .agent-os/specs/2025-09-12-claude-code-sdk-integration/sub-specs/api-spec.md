# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-12-claude-code-sdk-integration/spec.md

## Authentication & Headers

- Customer endpoints require `Authorization: Bearer <supabase-jwt>`
- System-to-system calls require internal service token `X-Service-Token`
- All endpoints accept optional `X-Request-ID` for correlation
- Streaming: SDK-powered endpoints support native AsyncGenerator streaming via SSE
- WebSocket: Real-time approval flows via `ws://` upgrade for HITL integration

## Endpoints

### POST /api/v1/ai/diagnostics/analyze

Purpose: Analyze device diagnostics and summarize likely root causes.
Query Params (optional): `stream=true` to receive SSE events.
Request Body:

```json
{
  "sessionId": "string",
  "deviceId": "string",
  "telemetry": { "...": "opaque" },
  "diagnostics": { "...": "opaque" },
  "sdkOptions": {
    "maxThinkingTokens": 10000,
    "includePartialMessages": true
  }
}
```

Response (non-streaming):

```json
{
  "findings": [{ "id": "string", "title": "string", "confidence": 0.0, "evidence": ["..."] }],
  "summary": "string",
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500,
    "cache_creation_input_tokens": 0, // Tokens used to create cache
    "cache_read_input_tokens": 200 // Tokens read from cache
  },
  "requestId": "string"
}
```

Note: The `usage` object matches the SDK's `NonNullableUsage` type with all fields guaranteed to be present (nulls converted to 0).

Streaming Response (SSE):
Note: SSE lines reflect orchestrator events derived from SDK messages. The orchestrator may transform or aggregate SDK messages before streaming.

```
// SDKPartialAssistantMessage events (when includePartialMessages=true)
data: {"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"Analyzing network..."}},"uuid":"...","session_id":"..."}

// SDKAssistantMessage with findings
data: {"type":"assistant","message":{"content":[{"type":"text","text":"Found DNS issue"}]},"uuid":"...","session_id":"..."}

// SDKResultMessage with final summary
data: {"type":"result","subtype":"success","summary":"...","usage":{"input_tokens":1000,"output_tokens":500,"cache_creation_input_tokens":0,"cache_read_input_tokens":200},"duration_ms":2500}
```

Errors: 400 invalid input, 401 unauthorized, 503 upstream AI unavailable.

### POST /api/v1/ai/scripts/generate

Purpose: Generate proposed remediation script(s) from findings using SDK MCP tools.
Query Params (optional): `stream=true` for AsyncGenerator streaming.
Request Body:

```json
{
  "sessionId": "string",
  "deviceId": "string",
  "findings": [{ "id": "string", "title": "string" }],
  "constraints": { "maxRuntimeSec": 60, "allowedBinaries": ["sh", "bash", "ip", "ping"] },
  "sdkOptions": {
    "allowedTools": ["network_diagnostic", "script_generator"], // Server filters: requested ∩ policy-allowed
    "permissionMode": "default" // Server enforces: only 'default' or 'plan' allowed
    // Note: mcpServers are configured server-side only for security
    // Note: Client requests are validated against server-side security policies
  }
}
```

Response:

```json
{
  "proposals": [
    {
      "id": "string",
      "intent": "string",
      "risk": "low|medium|high",
      "rollbackPlan": "string",
      "script": "base64-sh",
      "manifest": {
        "interpreter": "bash",
        "timeoutSec": 60,
        "allowedBinaries": ["sh", "bash", "ip", "ping"],
        "capabilities": ["NET_RAW"],
        "networkPolicy": "none|egress-only|host",
        "envAllowlist": ["HTTP_PROXY"],
        "resources": { "cpuQuota": "50%", "memoryMax": "256Mi", "pidsMax": 128 },
        "workingDir": "/var/lib/aizen/runner"
      }
    }
  ],
  "requestId": "string"
}
```

Errors: 400 invalid input, 401 unauthorized, 422 unsafe content, 503 upstream AI unavailable.

### POST /api/v1/ai/scripts/validate

Purpose: Validate a proposed script against policy and environment constraints.
Request Body:

```json
{
  "proposalId": "string",
  "script": "base64-sh",
  "manifest": {
    /* full manifest schema */
  }
}
```

Response:

```json
{
  "valid": true,
  "violations": [{ "code": "DENY_NET", "detail": "..." }],
  "score": 0.0,
  "normalizedManifest": {
    /* sanitized + defaults applied */
  }
}
```

Errors: 400 invalid input, 401 unauthorized.

### POST /api/v1/ai/scripts/submit-for-approval

Purpose: Create an approval record to be surfaced in the web portal.
Request Body:

```json
{ "proposalId": "string", "sessionId": "string", "notes": "string" }
```

Response:

```json
{ "approvalId": "string", "status": "pending", "risk": "low|medium|high", "requiredApprovals": 1 }
```

Errors: 400 invalid input, 401 unauthorized, 409 already submitted.

### POST /api/v1/ai/scripts/:id/dispatch

Purpose: (Internal) After approval, package and enqueue a signed script to the device command queue.
Auth: `X-Service-Token` required.
Request Body:

```json
{ "deviceId": "string" }
```

Response:

```json
{ "commandId": "string", "packageDigest": "sha256-...", "requestId": "string" }
```

Errors: 400 invalid input, 401 unauthorized, 403 forbidden, 409 not approved, 404 not found.

### WS /api/v1/ai/approval-stream

Purpose: WebSocket endpoint for real-time HITL approval flow integrated with SDK's `canUseTool`.
Auth: Requires initial JWT authentication message.
Message Flow:

```json
// Client → Server (Authentication)
{
  "type": "auth",
  "token": "<supabase-jwt>"
}

// Server → Client (Approval Request)
{
  "type": "approval_request",
  "id": "req_123",
  "toolName": "network_diagnostic",
  "input": { "command": "ping", "target": "8.8.8.8" },
  "risk": "low",
  "intent": "Test connectivity to Google DNS"
}

// Client → Server (Approval Response)
{
  "type": "approval_response",
  "id": "req_123",
  "approved": true,
  "modifiedInput": { "command": "ping", "target": "8.8.8.8", "count": 3 }
}

// Server → Client (Execution Update)
{
  "type": "execution_update",
  "id": "req_123",
  "status": "completed",
  "result": { "success": true, "output": "..." }
}
```

### GET /api/v1/ai/mcp-tools

Purpose: List available MCP tools registered with the SDK.
Response:

```json
{
  "tools": [
    {
      "name": "network_diagnostic",
      "description": "Run network diagnostic commands",
      "inputSchema": {
        /* Zod schema as JSON */
      },
      "riskLevel": "low",
      "requiresApproval": true
    }
  ]
}
```
