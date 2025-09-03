# Technical Stack

> Last Updated: 2025-09-02
> Version: 1.0.0

## Application Framework

- **Framework:** Node.js
- **Version:** ≥20.0.0

## Database

- **Primary Database:** PostgreSQL via Supabase v2.56.0
- **Cache:** Redis 7.4
- **Database Hosting:** Supabase Cloud
- **Schema Status:** Complete with RLS policies, audit logging, and multi-tenant isolation

## JavaScript

- **Framework:** TypeScript 5.9.2 (strict mode)
- **Build System:** Nx monorepo v21.4.1
- **Package Manager:** npm ≥10.0.0

## CSS Framework

- **Framework:** Tailwind CSS
- **UI Component Library:** TBD (Next.js 14 planned)

## Frontend Framework

- **Framework:** Next.js 14 (planned for web portal)
- **Import Strategy:** Node.js modules

## Testing

- **Testing Framework:** Vitest 3.2.4
- **Coverage Requirements:** 60-70% (package-specific thresholds)

## Infrastructure

- **Containerization:** Docker Compose (fully configured with health checks)
- **API Framework:** Express/Fastify (planned)
- **Real-time Communication:** WebSocket connections (planned)
- **Device Agent:** Node.js/TypeScript for Raspberry Pi (scaffolded)

## External Services

- **AI Integration:** Claude SDK for LLM orchestration
- **Authentication:** Supabase Auth (email-based sign-in); MFA deferred
- **Cellular Connectivity:** Out-of-band LTE/4G for device agents

## Development Tools

- **Code Quality:** ESLint, Prettier
- **Pre-commit Hooks:** Husky + lint-staged
- **Type Checking:** TypeScript strict mode
- **Monorepo Management:** Nx workspace

## Deployment Solution

- **Container Orchestration:** Docker Compose
- **Asset Hosting:** TBD
- **Application Hosting:** TBD

## Code Repository

- **Repository:** Private (Zen Network Support project)
