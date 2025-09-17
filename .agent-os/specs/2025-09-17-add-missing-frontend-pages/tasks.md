# Spec Tasks

## Tasks

- [x] 1. Dashboard Essentials (Test First)
  - [x] 1.1 Write failing Vitest + Testing Library specs that capture dashboard counts, alerts, and websocket refresh expectations
  - [x] 1.2 Inventory existing organization/device/session aggregates needed for the tests
  - [x] 1.3 Implement `/dashboard` with summary cards and recent activity list until tests pass (no charts)
  - [x] 1.4 Refine websocket refresh hooks and update tests if behavior changes intentionally

- [ ] 2. Organization Settings MVP (Test First)
  - [ ] 2.1 Add failing tests ensuring Supabase auth guard blocks rendering until hydration completes
  - [ ] 2.2 Build `/settings/organization` single-page profile form with validation + billing portal link to satisfy tests
  - [ ] 2.3 Connect form submissions to the organization PATCH endpoint and extend tests for error/success states

- [ ] 3. Device Management Basics (Test First)
  - [ ] 3.1 Write failing tests for `/devices` table filters, status badges, and registration flow
  - [ ] 3.2 Implement `/devices` list and registration modal (activation code surfaced) to make tests pass
  - [ ] 3.3 Hook into websocket `device_*` events and assert refresh behavior via tests

- [ ] 4. User Administration Basics (Test First)
  - [ ] 4.1 Draft failing tests for `/users` table search, pagination, and role display
  - [ ] 4.2 Implement invite, resend invite, and role toggle actions until tests succeed
  - [ ] 4.3 Subscribe to `user_*` websocket events and validate real-time updates in tests

- [ ] 5. Sessions Queue & Approvals (Test First)
  - [ ] 5.1 Add failing tests for sessions queue filters, approve/reject actions, and transcript access
  - [ ] 5.2 Implement `/sessions` queue UI plus approval handlers to satisfy tests
  - [ ] 5.3 Cover websocket or polling refresh ensuring approved sessions leave the queue

- [ ] 6. Chat Persistence (Test First)
  - [ ] 6.1 Write failing store tests that expect chat sessions/messages to load from API and persist
  - [ ] 6.2 Replace mock chat adapters with real API wiring until tests pass
  - [ ] 6.3 Add tests (or extend existing) for live updates post-send via websocket/polling

- [ ] 7. QA & Documentation
  - [ ] 7.1 Run the full Vitest suite, update snapshots, and ensure all new tests cover key flows
  - [ ] 7.2 Update docs with MVP scope, deferred features, and onboarding flow overview
