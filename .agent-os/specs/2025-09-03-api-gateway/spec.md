# Spec Requirements Document

> Spec: API Gateway Implementation
> Created: 2025-09-03

## Overview

Implement a Fastify-based API gateway that serves as the central communication hub between device agents and cloud services. This gateway will handle authentication, routing, and real-time communication for both device agents and customer web portal users.

## User Stories

### Device Agent Connection

As a Raspberry Pi device agent, I want to connect securely to the API gateway, so that I can send diagnostic data and receive commands.

The device agent will authenticate using its device ID and secret, establish a connection to the gateway, send periodic heartbeat updates, and execute diagnostic commands received from the cloud. The gateway will validate device credentials, track device status, and route commands between the device and appropriate backend services.

### Customer Portal Access

As a customer, I want to access my network device status through the web portal, so that I can monitor diagnostics and approve remediation actions.

Customers will authenticate via Supabase Auth, view real-time device status, initiate diagnostic sessions, and approve AI-generated remediation plans. The gateway will handle session management, enforce customer-device access controls, and provide WebSocket connections for live updates.

### System Administrator Monitoring

As a system administrator, I want to monitor API health and performance, so that I can ensure system reliability and troubleshoot issues.

Administrators will access health check endpoints, view readiness status, monitor version information, and track API metrics. The gateway will provide standardized health endpoints and integrate with monitoring systems.

## Spec Scope

1. **Authentication Middleware** - Dual-path authentication for device agents (ID/secret) and customers (Supabase Auth)
2. **Core API Endpoints** - Device registration, heartbeat, diagnostic commands, session management, and customer endpoints
3. **Real-time Communication** - WebSocket support for live status updates and command execution
4. **Database Integration** - Supabase client for data persistence and Redis for session/cache management
5. **Health Monitoring** - Standard health check, readiness, and version endpoints

## Out of Scope

- Rate limiting per device/customer (deferred to later phase)
- Complex CORS configuration (keeping it simple initially)
- Voice interface integration
- AI/Claude SDK integration (Phase 2)
- Advanced security features like API key rotation

## Expected Deliverable

1. Fastify server running on configured port with authentication middleware that successfully validates both device and customer credentials
2. Functional API endpoints accessible via HTTP/HTTPS that handle device registration, heartbeat updates, and diagnostic command routing
3. WebSocket connection support that enables real-time bidirectional communication between devices and web portal

## Spec Documentation

- Tasks: @.agent-os/specs/2025-09-03-api-gateway/tasks.md
- Technical Specification: @.agent-os/specs/2025-09-03-api-gateway/sub-specs/technical-spec.md
