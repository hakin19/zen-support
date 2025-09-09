# Spec Requirements Document

> Spec: Device Agent Local Bootstrap
> Created: 2025-09-09

## Overview

Establish a minimal end-to-end connection between a Dockerized Device Agent and the existing API/Web portal, demonstrating authentication, heartbeat monitoring, WebSocket connectivity, and real-time device status updates. This bootstrap provides the foundation for local development and testing of the device-to-cloud communication pipeline without requiring physical hardware or cellular connectivity.

## User Stories

### Device Agent Connection

As a developer, I want to run a containerized Device Agent that connects to the local API, so that I can test and develop the device-to-cloud communication flow locally.

The workflow starts with the Device Agent container authenticating to the API using deviceId and deviceSecret credentials. Upon successful authentication, the agent receives a session token and begins sending periodic heartbeats to maintain its online status. The agent establishes a WebSocket connection for real-time bidirectional communication, enabling it to receive commands from the cloud and send acknowledgments back.

### Real-Time Device Monitoring

As a system administrator, I want to see device status updates in real-time through the web portal, so that I can monitor device health and connectivity.

When the Device Agent starts and authenticates, the web portal should show the device as online within 2 seconds. The portal displays current device metrics (CPU, memory, uptime) from heartbeat data and updates the last_seen timestamp continuously. When the agent stops or loses connection, the portal should reflect the offline status within the configured timeout window.

### Local Development Environment

As a developer, I want a simple local setup process that brings up all required services, so that I can quickly iterate on device agent features without complex infrastructure setup.

The setup provides clear commands to start Redis, API, Web, and Device Agent services with proper environment configuration. Platform-specific networking is handled automatically (host.docker.internal for Mac/Windows, host-gateway for Linux). Health checks ensure all services are running correctly before testing begins.

## Spec Scope

1. **Device Authentication** - Implement POST /api/v1/device/auth endpoint integration with session token generation and storage
2. **Heartbeat System** - Create periodic heartbeat submission to POST /api/v1/device/heartbeat with health metrics and configurable intervals
3. **WebSocket Connection** - Establish persistent WebSocket connection at /api/v1/device/ws with minimal message protocol (connected, heartbeat, command, command_result)
4. **Mock Mode Support** - Provide MOCK_MODE=true configuration for simulated device behavior without real API calls
5. **Local Docker Setup** - Configure Docker Compose with Redis, Device Agent, and networking for local development across Mac/Windows/Linux

## Out of Scope

- Voice integration and telephony features
- LTE/cellular connectivity simulation
- AI orchestration and diagnostic planning
- Production TLS certificates and security hardening
- Multi-tenant customer portal features
- Complex command execution beyond simple acknowledgment
- Production scaling and load balancing
- Physical Raspberry Pi hardware integration

## Expected Deliverable

1. API health endpoint returns 200 OK, device heartbeats update last_seen timestamp and online status, metrics are stored in database
2. Device Agent container health endpoint reports healthy status, logs show successful authentication and recurring heartbeats, WebSocket connects and acknowledges test commands
3. Web portal displays device online within 2 seconds of agent start, shows offline status within timeout window after agent stop, real-time updates visible in device dashboard
