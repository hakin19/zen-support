# Spec Tasks

## Tasks

- [ ] 1. Define orchestrator prompts and program structure
  - [ ] 1.1 Draft analysis prompt templates with input schemas
  - [ ] 1.2 Draft script-generation templates with safety disclaimers and rollback plan format
  - [ ] 1.3 Create evaluation prompts for risk scoring and safety level

- [ ] 2. Implement Claude Code SDK client in `@aizen/api`
  - [ ] 2.1 Add configuration, env validation, and typing
  - [ ] 2.2 Implement analysis function (diagnostics → findings)
  - [ ] 2.3 Implement script-generation function (findings → scripts)
  - [ ] 2.4 Implement validation function (scripts → policy verdict, risk level)

- [ ] 3. Build workflow APIs in API gateway
  - [ ] 3.1 POST `/api/v1/ai/diagnostics/analyze`
  - [ ] 3.2 POST `/api/v1/ai/scripts/generate`
  - [ ] 3.3 POST `/api/v1/ai/scripts/validate`
  - [ ] 3.4 POST `/api/v1/ai/scripts/submit-for-approval`

- [ ] 4. HITL integration with web portal
  - [ ] 4.1 Approval UI with script diff, intent, risk, and rollback details
  - [ ] 4.2 Persist immutable approval record with correlation IDs
  - [ ] 4.3 WebSocket updates for status changes

- [ ] 5. Execution handoff to device agent
  - [ ] 5.1 Package approved script with manifest and checksum
  - [ ] 5.2 Device agent receives, validates, and executes in restricted mode
  - [ ] 5.3 Result reporting with logs, exit code, and rollback signal if needed

- [ ] 6. Safety and sanitization
  - [ ] 6.1 PII scrubbing pre-processor for diagnostic payloads
  - [ ] 6.2 Allow/Deny policy and file-system/network guardrails
  - [ ] 6.3 Red-team test suite for prompt-injection and unwanted capabilities

- [ ] 7. Observability and docs
  - [ ] 7.1 Metrics (acceptance rate, false-positive validations, MTTA/MTTR deltas)
  - [ ] 7.2 Structured logs and correlation IDs across components
  - [ ] 7.3 Developer docs for prompts, policies, and integration points
