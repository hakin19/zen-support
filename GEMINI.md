# Gemini Workspace Context

This document provides context for the Zen & Zen Network Support (Aizen vNE) project.

## Project Overview

This is a monorepo for an AI-powered Virtual Network Engineer system. The project is built with TypeScript and managed with Nx.

The project is organized into the following packages:

*   `packages/api`: Backend API service (Node.js/Fastify)
*   `packages/web`: Customer web portal (Next.js)
*   `packages/device-agent`: Raspberry Pi agent
*   `packages/shared`: Shared types and utilities

The architecture is a "hands on-prem, brains in-the-cloud" model. A Raspberry Pi device on-premise collects network diagnostic data and sends it to a cloud backend for analysis and remediation.

## Building and Running

### Prerequisites

*   Node.js 20+
*   npm 10+

### Key Commands

*   `npm install`: Install dependencies.
*   `npm run dev`: Start all services in development mode.
*   `npm run build`: Build all packages.
*   `npm run test`: Run tests across all packages.
*   `npm run lint`: Lint all packages.
*   `npm run graph`: Visualize project graph.

## Development Conventions

### Full Stack Development

*   Iterative delivery of small, working slices of functionality.
*   Understand existing patterns before coding.
*   Write tests first (TDD).
*   Commit messages should explain *why*, not just *what*.

### Architecture

*   Composition over inheritance.
*   Interfaces/contracts over direct calls.
*   Explicit data flow.

### Code Quality

*   All code must pass linting, type checks, and formatting.
*   All new logic must be tested.
*   Error handling should be descriptive and include correlation IDs.
