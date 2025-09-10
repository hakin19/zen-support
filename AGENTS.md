# Repository Guidelines

## Project Structure & Module Organization

- Monorepo managed by Nx. Key packages live under `packages/`:
  - `api/`: Fastify backend
  - `web/`: Next.js web portal
  - `device-agent/`: Raspberry Pi agent
  - `shared/`: Shared types/utilities
- Tests live alongside source (e.g., `src/**/*.test.ts(x)`) and in `test/`.
- Infra and local services: `infrastructure/docker/`, Supabase config in `supabase/`.

## Build, Test, and Development Commands

- Install: `npm install`
- Dev (all): `npm run dev` (Nx runs `dev` across projects)
- Dev (single): `npx nx run api:dev` | `web:dev` | `device-agent:dev`
- Build: `npm run build` (or `npx nx run-many --target=build --all`)
- Test: `npm run test` | watch `npm run test:watch` | coverage `npm run test:coverage`
- Integration DB: `npm run test:supabase:init` then `npm run test`
- Lint/Format/Types: `npm run lint` | `npm run lint:fix` | `npm run format` | `npm run type-check`
- Graph/Clean: `npm run graph` | `npm run clean`

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Format with Prettier (2-space indent, semicolons, single quotes).
- Exports: Prefer named exports; allow default exports in `web` components/pages.
- Filenames: `kebab-case.ts`; React components `PascalCase.tsx`.
- Imports: Use `@aizen/*` aliases; enforce `import/order` and `import type {..}` for types.
- Linting: ESLint flat config (`eslint.config.js`) is authoritative.

## Testing Guidelines

- Framework: Vitest (+ Testing Library for `web`).
- Naming: `*.test.ts(x)` or `*.spec.ts(x)` under `src/` or `test/`.
- Coverage: Global 60%+; higher per-package thresholds (e.g., `shared` 70%, `api` 65%). Check reports in `coverage/`.
- Integration tests may require local Supabase: `npm run test:supabase:init`.

## Commit & Pull Request Guidelines

- Commits: Conventional style with scope, e.g., `feat(api): add session service`, `fix(web): sidebar layout` (`feat|fix|docs|chore|refactor`).
- PRs must include: description, scope (api/web/device-agent/shared), linked issues, UI screenshots if applicable, and a test plan.
- Validation: Ensure `npm run ci:validate` passes locally (format, lint, type-check, tests, build). No secrets in diffs.

## Security & Configuration Tips

- Copy envs: `npm run setup:env` (edit `.env`, `.env.test`). Never commit secrets.
- See `docs/security-guide.md` and `docs/architecture.md` for deeper guidance.
