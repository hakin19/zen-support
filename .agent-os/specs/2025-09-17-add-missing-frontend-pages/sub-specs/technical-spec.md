# Technical Specification

This technical spec complements the MVP requirements in `../spec.md` for the missing frontend surfaces.

## Frontend Architecture

- **App Router Structure**: Add Next.js routes under `packages/web/app/` (`dashboard/page.tsx`, `devices/page.tsx`, `sessions/page.tsx`, `users/page.tsx`, `settings/organization/page.tsx`). Guard each route with existing Supabase session middleware.
- **Layout Reuse**: Reuse the authenticated shell (`packages/web/src/components/settings/SettingsPage.tsx`) by ensuring auth store hydration before rendering. Avoid new layout abstractions.
- **Components**: Leverage existing shadcn/ui components and table abstractions; create lightweight wrappers only when necessary for consistency across pages.

## State Management

- Extend current Zustand stores for auth, devices, users, sessions, and chat.
  - Add minimal selectors for dashboard counts and pending approvals.
  - Use straightforward fetch→store patterns; polling/websocket refresh only where already supported.
- Prefer simple `fetch` helpers consistent with the repo; introduce additional libraries only if already in use.

## Real-Time Integration

- Reuse existing websocket clients. Register handlers for `device_*`, `user_*`, and session approval events to refresh associated lists.
- Apply optimistic updates sparingly—only where failure states are easily rolled back (e.g., resend invite confirmation).

## Access Control

- Use Supabase JWT claims to gate owner-only data like billing link and approvals.
- Disable or hide actions when the current role lacks permission; display inline messaging for clarity.

## Form Handling

- Keep forms simple with basic validation using current utilities (e.g., `zod` schemas already present). Avoid multi-step wizards.
- Show success/error toasts leveraging the existing notification helper.

## Visualization Requirements

- Dashboard uses text-based summary cards and lists; defer charting libraries until post-MVP.

## Testing Strategy

- Add Vitest + Testing Library coverage for new store logic, dashboard counts, and action handlers (invite, register device, approve session).
- Mock Supabase session in tests to verify route guards and role-specific UI states.

## Performance Considerations

- Paginate `/users`, `/devices`, and `/sessions` lists server-side to avoid large payloads.
- Debounce search inputs lightly (e.g., 300ms) to reduce request spam.

## Observability

- Reuse existing client logging to capture API errors surfaced to users. No new telemetry systems required.

## Follow-Up Work (Post-MVP)

- Reintroduce advanced security toggles, bulk actions, analytics charts, and AI prompt governance once MVP usage is validated.
