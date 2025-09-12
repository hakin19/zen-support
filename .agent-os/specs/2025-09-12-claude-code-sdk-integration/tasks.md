# Spec Tasks

## Tasks

- [ ] 1. Define orchestrator prompts and program structure
  - [ ] 1.1 Draft analysis prompt templates with input schemas
  - [ ] 1.2 Draft script-generation templates with safety disclaimers and rollback plan format
  - [ ] 1.3 Create evaluation prompts for risk scoring and safety level

- [ ] 2. Implement Claude Code SDK integration (Python sidecar + Node adapter)
  - [ ] 2.1 Provision SDK runtime: `pip install claude-code-sdk` and `npm -g @anthropic-ai/claude-code`; add `claude doctor` health check
  - [ ] 2.2 Add configuration, env validation (`ANTHROPIC_API_KEY` optional; CLI login supported), and typing
  - [ ] 2.3 Implement analysis function (diagnostics → findings) via sidecar endpoint (streaming)
  - [ ] 2.4 Implement script-generation function (findings → scripts) via sidecar (tools disabled)
  - [ ] 2.5 Implement validation function (scripts → policy verdict, risk level)

- [ ] 3. Build workflow APIs in API gateway
  - [ ] 3.1 POST `/api/v1/ai/diagnostics/analyze` (SSE streaming supported)
  - [ ] 3.2 POST `/api/v1/ai/scripts/generate` (optionally streaming progress)
  - [ ] 3.3 POST `/api/v1/ai/scripts/validate`
  - [ ] 3.4 POST `/api/v1/ai/scripts/submit-for-approval`
  - [ ] 3.5 POST `/api/v1/ai/scripts/:id/dispatch` (internal, `X-Service-Token`) → enqueue signed package to device command queue

- [ ] 4. HITL integration with web portal
  - [ ] 4.1 Approval UI with script diff, intent, risk, and rollback details
  - [ ] 4.2 Persist immutable approval record with correlation IDs
  - [ ] 4.3 WebSocket updates for status changes

- [ ] 5. Execution handoff to device agent
  - [ ] 5.1 Package approved script with manifest and checksum
  - [ ] 5.2 Manifest schema: `interpreter`, `timeoutSec`, `allowedBinaries[]`, `capabilities[]`, `networkPolicy`, `envAllowlist[]`, `resources{cpuQuota,memoryMax,pidsMax}`, `workingDir`
  - [ ] 5.3 Sign package (ed25519); expose `digest` and `signature`; store public key in device trust store
  - [ ] 5.4 Device agent receives, verifies signature + checksum, enforces manifest, executes in systemd-run sandbox
  - [ ] 5.5 Result reporting with logs, exit code, resource usage, and rollback signal if needed

- [ ] 6. Safety and sanitization
  - [ ] 6.1 PII scrubbing pre-processor for diagnostic payloads
  - [ ] 6.2 Allow/Deny policy and file-system/network guardrails
  - [ ] 6.3 Red-team test suite for prompt-injection and unwanted capabilities
  - [ ] 6.4 SDK options enforcement: `allowed_tools=[]`, `permission_mode=ask`, `cwd` isolated
  - [ ] 6.5 Risk classes (diagnostics/remediation/high-risk) with policy gating; high-risk requires second approver (flag only for now)
  - [ ] 6.6 Device runner policy tests (systemd-run properties, caps, resource limits)

- [ ] 7. Observability and docs
  - [ ] 7.1 Metrics (acceptance rate, false-positive validations, MTTA/MTTR deltas)
  - [ ] 7.2 Structured logs and correlation IDs across components
  - [ ] 7.3 Developer docs for prompts, policies, and integration points
  - [ ] 7.4 Runbook for CLI login vs `ANTHROPIC_API_KEY`, and CI usage
