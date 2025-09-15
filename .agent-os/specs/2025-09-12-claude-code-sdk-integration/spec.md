# Spec Requirements Document

> Spec: Claude Code SDK Integration – AI Orchestration for Diagnostic Analysis and Script Generation
> Created: 2025-09-12
> Updated: 2025-09-14 - Migrated to TypeScript SDK

## Overview

Implement an AI orchestration service that uses the official Claude Code TypeScript SDK to analyze device diagnostics, synthesize findings, and generate safe, reviewable remediation scripts. The orchestrator runs natively within the Node.js API service, leveraging the SDK's built-in streaming, permission controls, and MCP tool capabilities. The system drives a human-in-the-loop workflow where customers approve AI-generated actions via the web portal before the device agent executes them, with complete PII sanitization, execution guardrails, and auditability.

Notes on SDK and runtime:

- Use the official Claude Code TypeScript SDK (`@anthropic/claude-code-sdk`) integrated directly in `@aizen/api` service
- SDK works with ANTHROPIC_API_KEY; Claude CLI is optional and auto-detected if present
- Leverage SDK's `canUseTool` callback for human-in-the-loop approval workflow
- Default to analysis-only mode with `allowedTools: []`; enable specific tools only after security review
- Create custom MCP tools for network-specific diagnostic capabilities

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

1. **AI Orchestrator Service** – Native TypeScript SDK integration in `@aizen/api`, prompt design, streaming response handling
2. **MCP Tool Development** – Custom network diagnostic tools using SDK's `createSdkMcpServer()` for device-specific operations
3. **Safety & Policy** – PII sanitization, SDK permission controls via `canUseTool`, command validation
4. **Workflow APIs** – Streaming endpoints for analysis, script generation, validation, and approval workflows
5. **HITL Integration** – Real-time WebSocket approval flow integrated with SDK's permission callbacks
6. **Execution Handoff** – Secure packaging of approved scripts for device agent with claim/ack semantics
7. **Observability** – Unified logging with correlation IDs, SDK message tracking, metrics for acceptance rates

## Out of Scope

- Voice interface integration (covered by separate spec)
- Advanced prompt fine-tuning beyond initial templates
- Autonomous execution without human approval

## Expected Deliverable

1. Native TypeScript SDK integration in `@aizen/api` with streaming analysis and script-generation APIs
2. Custom MCP tools for network diagnostics with safety constraints and approval workflows
3. Real-time HITL approval system using SDK's permission callbacks and WebSocket updates
4. PII sanitization pipeline and policy-based validation integrated with SDK's tool control
5. End-to-end flow: diagnostics → analysis → script proposal → portal approval → device execution → results
6. Complete TypeScript types and documentation for SDK integration, MCP tools, and API usage

## Spec Documentation

- Tasks: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/tasks.md
- Technical Specification: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/sub-specs/technical-spec.md
- API Specification: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/sub-specs/api-spec.md
- Safety Policy: @.agent-os/specs/2025-09-12-claude-code-sdk-integration/sub-specs/safety-policy.md
- TypeScript SDK Reference: @docs/Claude-Code-SDK-TypeScript-SDK-reference
