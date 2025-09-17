# API Integration Outline

This document lists the Fastify endpoints used to power the trimmed MVP frontend surfaces. All routes already exist in `packages/api`; work focuses on wiring them into the Next.js portal with correct auth and error handling.

## Dashboard Data Sources

- `GET /api/organization/profile` → organization summary cards (packages/api/src/routes/organization.ts:68)
- `GET /api/organization/device-health` → fleet status counts (routes/organization.ts:174)
- `GET /api/customer-sessions/alerts` → pending approvals + recent activity (routes/customer-sessions.ts:51, 168)

## Organization Settings

- `PATCH /api/organization/profile` → update contact/profile info (routes/organization.ts:330)
- `GET /api/organization/billing` → link or token for billing portal (routes/organization.ts:253)

## Devices

- `GET /api/devices` with filters for status/label (routes/devices.ts:48, 93)
- `POST /api/devices/register` → registration modal + activation code (routes/devices.ts:250)

## Users

- `GET /api/users` with `search` and pagination params (routes/users.ts:45)
- `POST /api/users/invite` and `POST /api/users/:id/resend-invite` (routes/users.ts:106, 501)
- `POST /api/users/:id/role` → toggle admin/member role (routes/users.ts:300)

## Sessions & Approvals

- `GET /api/customer-sessions` with status filter (routes/customer-sessions.ts:51)
- `GET /api/customer-sessions/:id` → transcript summary (routes/customer-sessions.ts:168)
- `POST /api/customer-sessions/:id/approve` / `POST /api/customer-sessions/:id/reject` (routes/customer-sessions.ts:243, 415)

## Chat Persistence

- `GET /api/chat/sessions` / `POST /api/chat/sessions` (routes/chat.ts:67)
- `GET /api/chat/sessions/:id/messages` / `POST /api/chat/messages` (routes/chat.ts:220, 311)

## Real-Time Channels

- WebSocket events `device_*` (routes/devices.ts:156, 294)
- WebSocket events `user_*` (routes/users.ts:214, 270)
- Session approval broadcasts (routes/customer-sessions.ts:243)

### Integration Requirements

- Include Supabase JWT on every request; perform owner/admin gating client-side to mirror backend checks.
- Reuse shared API clients where available; otherwise extend `@aizen/shared` types for lightweight fetchers.
- Surface 4xx errors (license limit, permission) with contextual messaging rather than silent failures.
