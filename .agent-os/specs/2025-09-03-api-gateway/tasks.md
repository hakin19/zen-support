# Spec Tasks

## Tasks

- [x] 1. Set up Fastify server foundation and health endpoints
  - [x] 1.1 Write tests for health check endpoints (/healthz, /readyz, /version)
  - [x] 1.2 Install and configure Fastify with TypeScript types
  - [x] 1.3 Implement basic server with timeout configurations for ALB
  - [x] 1.4 Implement health endpoints with proper status codes
  - [x] 1.5 Add graceful shutdown handler with connection draining
  - [x] 1.6 Implement readiness checks for Supabase and Redis dependencies
  - [x] 1.7 Verify all health endpoint tests pass

- [x] 2. Implement device authentication system
  - [x] 2.1 Write tests for device auth endpoints (auth, register)
  - [x] 2.2 Create device authentication middleware with session tokens
  - [x] 2.3 Implement POST /api/v1/device/auth with Redis session storage
  - [x] 2.4 Implement device provisioning endpoint for customers
  - [x] 2.5 Implement POST /api/v1/device/register with activation codes
  - [x] 2.6 Add session token validation and TTL refresh logic
  - [x] 2.7 Verify all device auth tests pass

- [ ] 3. Build command queue system with claim semantics
  - [ ] 3.1 Write tests for command claim/extend/result endpoints
  - [ ] 3.2 Design Redis data structures for command queue
  - [ ] 3.3 Implement POST /api/v1/device/commands/claim with visibility timeout
  - [ ] 3.4 Implement POST /api/v1/device/commands/:id/extend for long operations
  - [ ] 3.5 Implement POST /api/v1/device/commands/:id/result with claim validation
  - [ ] 3.6 Add atomic Redis operations for claim management
  - [ ] 3.7 Implement automatic visibility timeout expiry
  - [ ] 3.8 Verify all command queue tests pass

- [ ] 4. Develop customer API endpoints and authentication
  - [ ] 4.1 Write tests for customer endpoints and Supabase JWT validation
  - [ ] 4.2 Create customer authentication middleware for Supabase JWTs
  - [ ] 4.3 Implement GET /api/v1/customer/devices endpoint
  - [ ] 4.4 Implement POST /api/v1/customer/sessions endpoints
  - [ ] 4.5 Implement session approval endpoint with HITL workflow
  - [ ] 4.6 Add customer-device relationship validation
  - [ ] 4.7 Implement system info endpoint for authenticated users
  - [ ] 4.8 Verify all customer API tests pass

- [ ] 5. Add WebSocket support and correlation tracking
  - [ ] 5.1 Write tests for WebSocket connections and message handling
  - [ ] 5.2 Install and configure @fastify/websocket plugin
  - [ ] 5.3 Implement device WebSocket endpoint with authentication
  - [ ] 5.4 Implement customer WebSocket endpoint with room management
  - [ ] 5.5 Add correlation ID (X-Request-ID) propagation system
  - [ ] 5.6 Implement WebSocket connection tracking and graceful close
  - [ ] 5.7 Add heartbeat/ping-pong for connection health
  - [ ] 5.8 Verify all WebSocket tests pass
