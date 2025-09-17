# Spec Requirements Document

> Spec: Add Missing Frontend - Add Missing Pages to Match the Envision User and Owner User Workflows
> Created: 2025-09-17

## Overview

Deliver the missing MVP portal screens so owners and organization admins can complete essential workflows inside Zen. The backend already exposes organization, device, session, AI, and chat endpoints; this spec wires them into focused Next.js 14 pages that reuse existing Supabase auth context and websocket stores without introducing new infrastructure.

## Goals

1. Stand up a lightweight `/dashboard` showing key organization counts, recent activity, and outstanding approvals.
2. Provide a minimal `/settings/organization` experience to edit contact/profile details and reach the billing portal.
3. Ship functional `/devices`, `/users`, and `/sessions` pages with the core actions needed for device registration, user invites, and HITL approvals.
4. Replace chat store mocks with the real `/api/chat/sessions` and `/api/chat/messages` API so conversations persist across reloads.

## User Stories

### Owner: Quick Health Snapshot

As the owner, I need a dashboard that surfaces organization health indicators and pending approvals so I can spot issues quickly without deep navigation.

### Organization Admin: Basic Onboarding

As an organization admin, I need to update my company profile and access billing from the product so I can finish onboarding without contacting support.

### Organization Admin: Device Registration

As an organization admin, I need a devices table with registration flow and status visibility so I can activate hardware and monitor connectivity.

### Organization Admin: User Access Control

As an organization admin, I need a users table with invite, resend, and role reassignment so I can manage access within my license limits.

### Owner & HITL Responders: Approve Sessions

As an owner or responder, I need a sessions queue that lists active diagnostics and lets me approve or reject pending commands so remediation keeps moving.

## Spec Scope

- `/dashboard` totals, recent activity list, and needs-attention callouts driven by existing aggregates (no charts in MVP)
- `/settings/organization` single-page profile form plus billing portal link (security toggles deferred)
- `/devices` table with filters, registration modal showing activation code, and basic status details
- `/users` table with search, invite/resend, role toggle between admin/member, and pagination
- `/sessions` queue with status filter, approval buttons, and transcript preview link
- Chat store migration from mock adapters to the real chat API endpoints

## Out of Scope

- Advanced security controls (SSO, 2FA, IP allowlists, webhook tests, rate limit tuning)
- Bulk user/device actions, CSV exports, firmware history timelines, or analytics charts
- Prompt publish/revert workflows, MCP tooling dashboards, or AI change history
- Additional backend endpoints beyond wiring existing Fastify routes
- Mobile or voice experience updates

## Dependencies

- Supabase auth store initialization fix so settings shell renders after hydration
- Existing websocket stores for `device_*`, `user_*`, and session approval events

## Deliverables

1. Functional Next.js routes and components for dashboard, settings, devices, users, sessions, and chat persistence.
2. Zustand stores hydrated from real API responses with websocket-driven refresh where already available.
3. Basic form validation and error handling that align with the current design system.
4. Tests covering critical stores, API integration hooks, and primary user interactions.
5. Documentation note describing the trimmed MVP scope and follow-up work for advanced features.
