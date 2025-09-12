# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-12-claude-code-sdk-integration/spec.md

## Authentication & Headers

- Customer endpoints require `Authorization: Bearer <supabase-jwt>`.
- System-to-system calls require internal service token `X-Service-Token`.
- All endpoints accept optional `X-Request-ID` for correlation.
- Streaming: endpoints marked as streamable support `Accept: text/event-stream` and `?stream=true`.

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
  "diagnostics": { "...": "opaque" }
}
```

Response:

```json
{
  "findings": [{ "id": "string", "title": "string", "confidence": 0.0, "evidence": ["..."] }],
  "summary": "string",
  "requestId": "string"
}
```

Errors: 400 invalid input, 401 unauthorized, 503 upstream AI unavailable.

### POST /api/v1/ai/scripts/generate

Purpose: Generate proposed remediation script(s) from findings.
Query Params (optional): `stream=true` to receive SSE events for long generations.
Request Body:

```json
{
  "sessionId": "string",
  "deviceId": "string",
  "findings": [{ "id": "string", "title": "string" }],
  "constraints": { "maxRuntimeSec": 60, "allowedBinaries": ["sh", "bash", "ip", "ping"] },
  "sdkOptions": { "allowedTools": [], "permissionMode": "ask" }
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
