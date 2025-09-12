# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-12-claude-code-sdk-integration/spec.md

## Architecture

- **Service**: `ai-orchestrator` composed of a Python sidecar (Claude Code SDK) and a Node adapter (Fastify plugin in `@aizen/api`)
- **LLM Client**: Claude Code SDK (Python) + Claude Code CLI, streaming enabled; tool usage disabled by default for execution (analysis only)
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
- SSE support for long-running operations: `Accept: text/event-stream`, heartbeat events, final aggregate JSON
- Return standardized error envelopes `{ error: { code, message, details } }`

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

- Unit tests: prompt builders, validators, sanitizers
- Integration tests: end-to-end flows with mocked Claude SDK and real CLI in a gated suite (`claude doctor` required)
- Red-team tests: prompt-injection, path traversal, network misuse attempts
- Load tests: p95 latency under concurrent analysis requests

## Configuration

- Env vars: `ANTHROPIC_API_KEY` (for CI/automation; CLI login also supported), `AI_ORCH_MAX_TIMEOUT_SEC`, `AI_ORCH_ALLOWED_BINARIES`, `AI_ORCH_DENY_PATHS`, `AI_ORCH_PERMISSION_MODE` (default `ask`), `AI_ORCH_ALLOWED_TOOLS` (default empty array)
- CLI dependency: `@anthropic-ai/claude-code` installed and available on PATH; health-checked via `claude doctor`
- Secrets managed via `.env` templates; never logged; validated at boot
