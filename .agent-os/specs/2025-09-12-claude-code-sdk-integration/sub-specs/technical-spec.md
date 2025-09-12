# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-12-claude-code-sdk-integration/spec.md

## Architecture

- **Service**: `ai-orchestrator` module inside `@aizen/api` (Fastify plugin)
- **LLM Client**: Claude Code SDK with streaming support and tool usage disabled for execution (analysis only)
- **Data Flow**: device diagnostics → sanitization → analysis → proposals → validation → approval → device execution
- **Storage**: Reuse Supabase for session/approval records; Redis for transient proposal caches
- **Observability**: Structured logs with `requestId`, metrics for latency, success rate, validation failures

## Safety Controls

- **PII Sanitization**: redact emails, phone numbers, IPs (public optional), MAC addresses, hostnames, and tokens
- **Policy Engine**: allow/deny for commands, file paths, network sockets; timeouts and max output size
- **Manifest**: interpreter, required env vars (none by default), timeout, working dir, and resource caps
- **Risk Scoring**: low/medium/high with rationale; high risk forces second approval path (future)

## Claude Program Design

- **Prompts**:
  - Analysis prompt: accept normalized diagnostics, return structured findings with confidence and evidence
  - Script prompt: accept selected finding + constraints, return script + manifest + rollback plan + intent
  - Validation prompt: self-critique pass producing violations hints (combined with static validator)
- **Outputs**: JSON-first responses parsed against Zod schemas with strict mode
- **Temperature**: conservative defaults for stability; deterministic where possible

## API Integration (Fastify)

- Register routes under `/api/v1/ai/*` with shared auth guard (Supabase JWT)
- Enforce `X-Request-ID`; generate if missing; propagate to logs and responses
- Input validation via `@fastify/TypeProviderZod`
- Return standardized error envelopes `{ error: { code, message, details } }`

## Execution Handoff

- Package approved script: base64 payload, manifest, checksum (SHA-256)
- Store package reference; enqueue to device command queue with claim token
- Device agent validates checksum, enforces manifest, runs in restricted shell
- Results returned with logs and exit code; orchestrator updates approval record

## Testing Strategy

- Unit tests: prompt builders, validators, sanitizers
- Integration tests: end-to-end flows with mocked Claude SDK
- Red-team tests: prompt-injection, path traversal, network misuse attempts
- Load tests: p95 latency under concurrent analysis requests

## Configuration

- Env vars: `CLAUDE_API_KEY`, `AI_ORCH_MAX_TIMEOUT_SEC`, `AI_ORCH_ALLOWED_BINARIES`, `AI_ORCH_DENY_PATHS`
- Secrets managed via `.env` templates; never logged; validated at boot
