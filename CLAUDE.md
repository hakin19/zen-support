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

## Planned Monorepo Structure

The project will be organized as a monorepo with the following structure:

- `packages/device-agent/` - Raspberry Pi agent (Node.js/TypeScript)
- `packages/pii-sanitizer/` - Cloud-based PII sanitization service
- `packages/web-portal/` - Customer portal (Next.js 14, TypeScript, Tailwind)
- `packages/api-gateway/` - Main API service (Node.js, Express/Fastify)
- `packages/ai-orchestrator/` - Claude Code SDK integration
- `packages/voice-service/` - Voice processing (Pipecat, Daily.co)
- `packages/diagnostic-engine/` - Script generation service
- `packages/shared/` - Shared types and utilities
- `infrastructure/` - Docker, Terraform, Kubernetes configs
- `tools/pi-emulator/` - Raspberry Pi emulation for development

## Technology Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.x
- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **API**: Express or Fastify
- **Database**: PostgreSQL via Supabase (auth, real-time, RLS)
- **Cache**: Redis 7
- **AI**: Claude Code SDK, cloud-based PII sanitization service
- **Voice**: Pipecat (self-hosted), Daily.co
- **Container**: Docker
- **Cloud**: AWS (ECS Fargate, ALB, CloudFront, S3, ElastiCache)
- **CI/CD**: GitHub Actions

## Development Commands (Future Implementation)

Once the monorepo is set up, these will be the primary commands:

```bash
# Install dependencies
npm install

# Run development environment
docker-compose up

# Run specific service
npm run dev:api-gateway
npm run dev:web-portal
npm run dev:voice-service

# Testing
npm test
npm run test:unit
npm run test:integration
npm run test:e2e

# Linting and formatting
npm run lint
npm run lint:fix
npm run format

# Build for production
npm run build
npm run build:docker

# Deploy
npm run deploy:staging
npm run deploy:production
```

## Key Implementation Phases

1. **Foundation** (Weeks 1-2): Monorepo setup, Docker environment, CI/CD
2. **Core Services** (Weeks 3-6): API Gateway, device simulator, web portal, Supabase
3. **AI Integration** (Weeks 7-10): Claude Code SDK, diagnostic engine, voice service, cloud PII sanitizer
4. **Testing & Deployment** (Weeks 11-12): E2E testing, security audit, AWS deployment

## Security Considerations

- All device-to-cloud communication is outbound-only via LTE
- Raw diagnostic data is transmitted securely to cloud where PII sanitization occurs before AI processing
- Multi-factor authentication: Caller ID + SMS OTP
- All remediation actions require explicit user approval via secure web portal
- Service-to-service communication uses mTLS
- Secrets managed via AWS Secrets Manager

## Current Status

The project is in the initial planning and architecture phase. The PRD and architecture documents have been created. The next step is to set up the monorepo structure and begin implementing the foundation components.

## Development Guidelines

@docs/development-guidelines.md

- Remember to search for appropriate subagents to use before starting a task and run subagents in the background and also in parallel if that makes sense.