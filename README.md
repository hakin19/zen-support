# Zen & Zen Network Support (Aizen vNE)

AI-powered Virtual Network Engineer system for intelligent network diagnostics and remediation.

## Project Structure

This project is organized as an Nx monorepo with the following packages:

```
packages/
├── api/              # Backend API service (Node.js/Fastify)
├── web/              # Customer web portal (Next.js)
├── device-agent/     # Raspberry Pi agent
└── shared/           # Shared types and utilities
```

## Prerequisites

- Node.js 20+ LTS
- npm 10+

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development Commands

```bash
# Start all services in development mode
npm run dev

# Build all packages
npm run build

# Run tests across all packages
npm run test

# Lint all packages
npm run lint

# Visualize project graph
npm run graph

# Clean workspace
npm run clean
```

### Testing Modes (MVP vs Full)

You can control which parts of the test suite run using the `TEST_MODE` env var. This helps speed up iteration during the MVP phase by skipping non‑critical UI/real‑time tests.

- `TEST_MODE=MVP` runs the MVP subset (core CRUD, permissions, basic UI flows)
- `TEST_MODE=FULL` runs the entire suite

How to use:

- Set in `.env` or `.env.test`:
  - `TEST_MODE=MVP` (recommended for local MVP development)
  - `TEST_MODE=FULL` (CI or full validation)
- Or use scripts:
  - `npm run test:mvp` → runs with `TEST_MODE=MVP`
  - `npm run test:full` → runs with `TEST_MODE=FULL`

Notes:

- The test harness dynamically skips some non‑MVP tests when `TEST_MODE=MVP` is set (e.g., certain real‑time UI flows, extended keyboard shortcut coverage, and multi‑filter combinations). The tests remain in the repo and re‑enable automatically under `TEST_MODE=FULL`.

### Working with Nx

This workspace uses Nx for monorepo management. Key commands:

```bash
# List all projects
npx nx show projects

# Run specific target for a project
npx nx run api:dev
npx nx run web:build

# Run target for multiple projects
npx nx run-many --target=test --projects=api,web

# See project dependencies
npx nx graph
```

## Package Development

Each package has its own `package.json` and can be developed independently:

- **@aizen/api**: Backend API service
- **@aizen/web**: Customer-facing web portal
- **@aizen/device-agent**: Raspberry Pi device agent
- **@aizen/shared**: Shared TypeScript types and utilities

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed system architecture.

## Implementation Plan

See [docs/implementation-plan.md](docs/implementation-plan.md) for the development roadmap.

## MVP Scope & Current Status

### ✅ Completed Features (Phase 200 MVP)

The customer portal MVP is complete with the following features:

- **Dashboard**: Real-time health overview with organization counts, device status, and pending approvals
- **Organization Settings**: Profile management with billing portal integration and security controls
- **Device Management**: Registration flow with activation codes and real-time status monitoring
- **User Administration**: Invitation system with role management and license enforcement
- **Sessions Queue**: HITL approval interface for diagnostic commands with audit trails
- **Chat Persistence**: Full API integration replacing mocked chat store with real persistence

### 🧪 Test Coverage

- **300+ Component Tests**: Comprehensive coverage of all UI components
- **Integration Tests**: End-to-end workflows for critical user journeys
- **Quality Gates**: >60% code coverage, TypeScript strict mode, automated linting
- **CI Integration**: Automated testing with Vitest and Testing Library

### 📋 Customer Onboarding Flow

1. **Account Setup** (5 min): Organization profile, billing setup, user invitations
2. **Device Registration** (10 min): Generate activation code, connect device, verify status
3. **First Session** (15 min): Submit diagnostic request, approve commands, review results
4. **Ongoing Management**: Monitor dashboard, manage users, review session history

### 🚀 Deferred Features (Post-MVP)

- Advanced analytics and custom reporting
- Voice service integration for phone support
- SSO integration and enterprise security features
- Multi-organization management for MSPs

## Development Guidelines

See [docs/development-guidelines.md](docs/development-guidelines.md) for coding standards and best practices.

## MVP Documentation

- [MVP Scope & Onboarding](docs/mvp-scope-and-onboarding.md) - Detailed feature scope and customer workflows
- [Architecture Overview](docs/architecture.md) - System design and technical architecture
- [Testing Strategy](docs/testing-guide.md) - Test framework and coverage requirements
