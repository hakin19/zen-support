# Repository Guidelines

## Project Structure & Module Organization
- Nx monorepo rooted here; core packages live in `packages/`: `api/` (Fastify backend), `web/` (Next.js portal), `device-agent/` (Raspberry Pi client), and `shared/` (types/utilities).
- Tests accompany source as `src/**/*.test.ts(x)` or `*.spec.ts(x)` and larger suites sit under `test/`.
- Operational assets live in `infrastructure/docker/`; Supabase migrations/configuration stay in `supabase/`; reference architectural notes in `docs/`.

## Build, Test, and Development Commands
- `npm install` — install workspace deps managed by Nx.
- `npm run dev` — launch all project dev servers concurrently.
- `npx nx run <project>:dev` — start an individual target such as `api`, `web`, or `device-agent`.
- `npm run build` — compile every package; use `npx nx run-many --target=build --all` for granular control.
- `npm run test` | `npm run test:watch` | `npm run test:coverage` — run Vitest once, in watch mode, or with coverage reporting.
- `npm run ci:validate` — required pre-PR gate: format, lint, type-check, test, and build in one pass.
- `npm run lint` / `npm run lint:fix` / `npm run format` / `npm run type-check` — targeted quality checks when iterating locally.

## Coding Style & Naming Conventions
- TypeScript (ESM) throughout; Prettier enforces 2-space indent, semicolons, and single quotes.
- Prefer named exports; limit default exports to Next.js pages/components inside `packages/web`.
- Respect `@aizen/*` path aliases; separate types via `import type` and keep import order lint-clean.
- Source files use kebab-case (e.g., `session-service.ts`); React components live in PascalCase `.tsx` files.

## Testing Guidelines
- Vitest is standard; Testing Library backs React tests inside `packages/web`.
- Name tests `*.test.ts(x)` or `*.spec.ts(x)` colocated with the code or in `test/`.
- Run `npm run test:supabase:init` before suites that hit the integration DB.
- Maintain ≥60% global coverage; hit package targets (`shared` ≥70%, `api` ≥65%) and review `coverage/` reports before merging.

## Commit & Pull Request Guidelines
- Follow conventional commits: `feat(api): add session service`, `fix(web): adjust sidebar`, `chore(device-agent): update deps`, etc.
- PRs must call out scope (api/web/device-agent/shared), link issues, supply UI screenshots when relevant, and describe the executed test plan.
- Validate locally with `npm run ci:validate` and double-check diffs for secrets or accidental env files.

## Security & Configuration Tips
- Seed env files with `npm run setup:env`, then edit `.env` and `.env.test`; never commit credentials.
- Review `docs/security-guide.md` and `docs/architecture.md` when introducing new services or hardware agents.
- Apply least-privilege keys for Raspberry Pi deployments and rotate secrets immediately if exposure is suspected.
