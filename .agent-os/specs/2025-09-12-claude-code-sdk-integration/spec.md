# Spec Requirements Document

> Spec: Claude Code SDK Integration – AI Orchestration for Diagnostic Analysis and Script Generation
> Created: 2025-09-12

## Overview

Implement an AI orchestration service that uses the Claude Code SDK to analyze device diagnostics, synthesize findings, and generate safe, reviewable remediation scripts. The orchestrator runs in the cloud, integrates with the API gateway, and drives a human-in-the-loop workflow where customers approve AI-generated actions via the web portal before the device agent executes them. The system enforces PII sanitization, strict execution guardrails, and complete auditability.

Notes on SDK and runtime:

- Use the official Claude Code SDK (Python) with the Claude Code CLI installed. Expose the SDK via a minimal internal HTTP interface (sidecar) consumed by `@aizen/api`.
- Default to analysis-only mode: no file edits or shell execution; explicitly disable tools unless a future spec approves enabling them.

## User Stories

### AI-Assisted Diagnostics (Customer)

As a customer, I want AI to analyze live diagnostics and summarize root causes so that I can quickly understand issues without deep networking expertise.

### Script Proposal with Safety Checks (Support Engineer)

As a support engineer, I want AI to propose scripts with clear intent, required permissions, and rollback steps so that execution on the device is controlled and reversible.

### Human-in-the-Loop Approval (Customer)

As a customer, I want to approve or reject AI-proposed remediation with full visibility into what will run, so that I can maintain control and auditability.

### Deterministic Execution on Device (System)

As the system, I want generated scripts to be validated against a safety policy and executed in a constrained context so that device stability and security are preserved.

## Spec Scope

1. **Orchestrator Service** – Claude Code SDK (Python) sidecar + client adapter in `@aizen/api`, prompt/program design, and response parsing
2. **Safety & Policy** – PII sanitization pre-processing, command allowlist/denylist, and script validation
3. **Workflow APIs** – Endpoints to request analysis, generate scripts, validate/score risk, and submit for approval
4. **HITL Integration** – Web-portal surfaced approval with immutable audit trail and diff of proposed changes
5. **Execution Handoff** – Secure packaging of approved scripts for device agent with claim/ack semantics
6. **Observability** – Structured logs with correlation IDs and metrics for latency, acceptance rate, and rollback usage

## Out of Scope

- Voice interface integration (covered by separate spec)
- Advanced prompt fine-tuning beyond initial templates
- Autonomous execution without human approval

## Expected Deliverable

1. Cloud service exposing analysis and script-generation APIs with Claude Code SDK wired and tested (Python sidecar + Node adapter)
2. PII sanitization pipeline and policy-based script validator with unit and integration tests
3. End-to-end flow: diagnostics → analysis → script proposal → portal approval → device execution → results
4. Documentation for prompts, policies, and API usage for `api`, `web`, and `device-agent` packages

## Spec Documentation

- Tasks: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/tasks.md
- Technical Specification: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/sub-specs/technical-spec.md
- API Specification: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/sub-specs/api-spec.md
