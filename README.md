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

## Development Guidelines

See [docs/development-guidelines.md](docs/development-guidelines.md) for coding standards and best practices.
