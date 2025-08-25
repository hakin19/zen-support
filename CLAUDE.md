# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Zen & Zen Network Support (Aizen vNE) project - an AI-powered Virtual Network Engineer system that provides intelligent network diagnostics and remediation through on-premise hardware agents and cloud-based AI services. The solution helps SMBs and mid-market companies resolve network issues quickly using a plug-and-play device with secure out-of-band cellular connectivity.

## Architecture Overview

The system follows a "hands on-prem, brains in-the-cloud" architecture:

- **On-Device Agent (Raspberry Pi)**: Executes diagnostic commands locally, manages credentials, serves secure web portal
- **Cloud AI Services**: Fine-tuned LLM for planning and analysis, diagnostic engine for script generation
- **Security Layer**: MFA authentication, cloud-based data sanitization, human-in-the-loop approval for all state changes
- **User Interface**: Multi-modal experience via phone (voice) and web portal

## Monorepo Structure

This is an Nx-based monorepo with the following packages:

- `packages/api/` - Backend API service (Node.js/Express)
- `packages/web/` - Customer web portal (Next.js 14, TypeScript, Tailwind)
- `packages/device-agent/` - Raspberry Pi agent (Node.js/TypeScript)
- `packages/shared/` - Shared types and utilities

## Development Commands

### Core Development

```bash
# Install dependencies
npm install

# Start all services in development mode
npm run dev

# Start specific services
npm run dev:api        # API service only
npm run dev:web        # Web portal only
npm run dev:device     # Device agent simulator
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests for specific package
npm test -- packages/api/**/*.test.ts

# Test environment management (Supabase)
npm run test:supabase:start   # Start local Supabase
npm run test:supabase:stop    # Stop local Supabase
npm run test:supabase:reset   # Reset test database
npm run test:supabase:init    # Full initialization with migrations
```

### Code Quality

```bash
# Lint all packages
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Type checking
npm run type-check

# Format code
npm run format

# Development validation pipeline (lint + type-check + test)
npm run dev:validate           # Full validation with coverage
npm run dev:test -- --fix      # Auto-fix and validate
npm run dev:test -- --affected # Only validate changed code
```

### Nx Commands

```bash
# Visualize project dependencies
npm run graph

# Run command for specific package
npx nx run @aizen/api:build
npx nx run @aizen/web:dev

# Run command for affected packages only
npx nx affected --target=test
npx nx affected --target=build
```

### Build & Deploy

```bash
# Build all packages
npm run build

# Build specific package
npx nx run @aizen/api:build

# Docker development
npm run dev:docker       # Start all services in Docker
npm run dev:docker:build # Build Docker images
npm run dev:docker:down  # Stop Docker services
```

## High-Level Architecture

### Service Communication Flow

1. **Device → API**: Raspberry Pi agents connect via outbound LTE/4G, sending sanitized diagnostic data
2. **API → Supabase**: PostgreSQL for persistence, real-time subscriptions, and authentication
3. **API → Redis**: Session management and real-time data caching
4. **API → Claude SDK**: AI orchestration for diagnostic analysis and script generation
5. **Web Portal ↔ API**: Real-time WebSocket connections for live updates and HITL approvals

### Database Schema

The system uses PostgreSQL via Supabase with these core tables:

- `customers`: Business accounts with subscription management
- `devices`: Registered Raspberry Pi devices per customer
- `diagnostic_sessions`: Active and historical support sessions
- `audit_log`: Complete audit trail for compliance

### Authentication & Security

- Multi-factor authentication: Caller ID verification + Email OTP
- All device communication is outbound-only via cellular
- PII sanitization occurs in cloud before AI processing
- Human-in-the-loop approval required for all remediation actions

## Testing Strategy

### Test Database

Tests use a local Supabase instance with fixed credentials:

- URL: `http://localhost:54321`
- Database: `postgresql://postgres:postgres@localhost:54322/postgres`

### Test Execution

Tests are run using Vitest with coverage thresholds:

- Global: 60% coverage required
- Shared package: 70% coverage required
- API package: 65% coverage required

### Pre-commit Hooks

Husky runs lint-staged on commit, which:

- Formats all code with Prettier
- Runs ESLint with auto-fix on TypeScript files
- Runs Next.js linting for web package
- Excludes test files from linting but formats them

## Critical Rules

**NEVER DELETE FILES WITHOUT EXPLICIT DOUBLE CONFIRMATION**: Test files and any other files in the codebase are critical components. Never suggest or attempt to delete any files without first getting explicit confirmation from the user, and then double-confirming the action.

**ESLINTIGNORE FILES ARE DEPRECATED**: .eslintignore files are no longer supported by ESLint. Use the "ignores" property in eslint.config.js files instead.

**HOW TO PROPERLY IGNORE TEST FILES IN ESLINT**: Test files are ignored via the global ignores section in eslint.config.js.

## Development Guidelines

Follow the guidelines in `docs/development-guidelines.md`:

- Iterative delivery over massive releases
- Understand existing patterns before coding
- Test-first development approach
- Maintain 60%+ test coverage for changed areas
- Ship vertical slices of functionality

## Code Search Strategy

When searching the codebase, prioritize the Gemini MCP tool for comprehensive analysis:

### Use Gemini MCP (`mcp__gemini-cli__ask-gemini`) for:

- Large file analysis exceeding 2000 lines
- Cross-file understanding and relationships
- Architecture exploration and patterns
- Refactoring preparation
- Complex pattern matching

### Use built-in tools (Grep, Glob, Read) for:

- Quick file existence checks
- Simple string searches
- Reading small, specific files
- Listing directory contents

## Environment Configuration

Copy `.env.example` to `.env` and configure:

- Supabase credentials (project ID, URLs, keys)
- Claude API key for AI integration
- Feature flags for voice service, device simulator, etc.

## Additional Notes

- Use Supabase MCP tools for database migrations and management
- Run appropriate subagents in parallel when beneficial
- Never skip pre-commit hooks unless explicitly requested
- Current year context: 2025
