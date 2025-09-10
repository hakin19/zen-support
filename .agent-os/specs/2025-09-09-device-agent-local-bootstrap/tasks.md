# Spec Tasks

## Tasks

- [x] 1. Set up Device Authentication and Session Management
  - [x] 1.1 Write tests for device authentication endpoint
  - [x] 1.2 Verify and align POST /api/v1/device/auth (session token generation)
  - [x] 1.3 Configure Redis sessions with key `session:{token}` and update WS lookup accordingly
  - [x] 1.4 Standardize API env on `SUPABASE_SERVICE_ROLE_KEY` (map existing value if needed)
  - [x] 1.5 Add session validation middleware for protected endpoints
  - [x] 1.6 Verify all authentication tests pass
  - [x] 1.7 Seed a test device (hashed secret) or provide a dev activation path so `/api/v1/device/auth` succeeds

- [x] 2. Implement Device Heartbeat System
  - [x] 2.1 Write tests for heartbeat endpoint and device status updates
  - [x] 2.2 Verify and align POST /api/v1/device/heartbeat (metrics and status updates)
  - [x] 2.3 Update device status in DB and broadcast `device_status` events (online/offline) on heartbeat success
  - [x] 2.4 Add metrics storage for CPU, memory, and uptime data
  - [x] 2.5 Configure heartbeat interval and timeout handling
  - [x] 2.6 Verify all heartbeat tests pass

- [x] 3. Establish WebSocket Communication
  - [x] 3.1 Write tests for WebSocket connection and message handling
  - [x] 3.2 Verify `/api/v1/device/ws` session authentication via header `X-Device-Session` and key `session:{token}`
  - [x] 3.3 Create message handlers for connected, heartbeat, command, and command_result
  - [x] 3.4 Add WebSocket reconnection logic with exponential backoff
  - [x] 3.5 Broadcast `device_status` events to portal on WS disconnect/timeouts
  - [x] 3.6 Verify all WebSocket tests pass
  - [x] 3.7 Add dev helper (endpoint or script) to enqueue a mock command to a connected device for WS ack verification

- [x] 4. Build Device Agent Container
  - [x] 4.1 Write tests for Device Agent authentication and heartbeat logic
  - [x] 4.2 Review existing Device Agent Dockerfile; ensure healthcheck, capabilities, tmpfs, and logs are correct
  - [x] 4.3 Implement MOCK_MODE for simulated device behavior
  - [x] 4.4 Implement Device Agent WebSocket client using auth token; add reconnect/backoff; integrate with auth/heartbeat
  - [x] 4.5 Configure environment variables and failure backoff policy
  - [x] 4.6 Add platform-specific networking (host.docker.internal); document Linux `--add-host=host.docker.internal:host-gateway`
  - [x] 4.7 Verify Device Agent tests pass and container builds successfully

- [ ] 5. Create Local Development Environment
  - [ ] 5.1 Write integration tests for end-to-end device connection flow
  - [ ] 5.2 Create docker-compose.yml with Redis and Device Agent; document hybrid run (API 3001 and Web 3000 via npm dev)
  - [ ] 5.3 Add environment configuration files (.env templates)
  - [ ] 5.4 Document local setup commands for Mac/Windows/Linux, including Linux add-host mapping
  - [ ] 5.5 Test Web portal real-time device status presence indicator updates
  - [ ] 5.6 Verify all integration tests pass and acceptance criteria are met
