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

- [x] 3. Build command queue system with claim semantics
  - [x] 3.1 Write tests for command claim/extend/result endpoints
  - [x] 3.2 Design Redis data structures for command queue
  - [x] 3.3 Implement POST /api/v1/device/commands/claim with visibility timeout
  - [x] 3.4 Implement POST /api/v1/device/commands/:id/extend for long operations
  - [x] 3.5 Implement POST /api/v1/device/commands/:id/result with claim validation
  - [x] 3.6 Add atomic Redis operations for claim management
  - [x] 3.7 Implement automatic visibility timeout expiry
  - [x] 3.8 Verify all command queue tests pass

- [x] 4. Develop customer API endpoints and authentication
  - [x] 4.1 Write tests for customer endpoints and Supabase JWT validation
  - [x] 4.2 Create customer authentication middleware for Supabase JWTs
  - [x] 4.3 Implement GET /api/v1/customer/devices endpoint
  - [x] 4.4 Implement POST /api/v1/customer/sessions endpoints
  - [x] 4.5 Implement session approval endpoint with HITL workflow
  - [x] 4.6 Add customer-device relationship validation
  - [x] 4.7 Implement system info endpoint for authenticated users
  - [x] 4.8 Verify all customer API tests pass

- [x] 5. Add WebSocket support and correlation tracking
  - [x] 5.1 Write tests for WebSocket connections and message handling
  - [x] 5.2 Install and configure @fastify/websocket plugin
  - [x] 5.3 Implement device WebSocket endpoint with authentication
  - [x] 5.4 Implement customer WebSocket endpoint with room management
  - [x] 5.5 Add correlation ID (X-Request-ID) propagation system
  - [x] 5.6 Implement WebSocket connection tracking and graceful close
  - [x] 5.7 Add heartbeat/ping-pong for connection health
  - [x] 5.8 Verify all WebSocket tests pass
