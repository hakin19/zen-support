# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-03-api-gateway/spec.md

## Technical Requirements

### Framework Configuration

- Fastify server with built-in logger and JSON schema validation
- Trust proxy configuration for proper IP handling behind load balancers
- **Graceful Shutdown Sequence**:
  1. On SIGTERM signal (ECS draining):
     - Stop accepting new HTTP connections immediately
     - Stop accepting new WebSocket connections
     - Send close frames to all WebSocket clients with reason code
     - Wait for in-flight HTTP requests to complete (max 30s)
     - Close database and Redis connections
     - Exit with code 0 for successful shutdown
  2. Force terminate after 30s if connections don't close
  3. Log all shutdown stages for debugging
- Environment-based configuration using existing config patterns
- **Timeout Configuration for ALB**:
  - Node.js `server.keepAliveTimeout`: 55000ms (55s)
  - Node.js `server.headersTimeout`: 56000ms (56s)
  - Fastify `requestTimeout`: 50000ms (50s)
  - Long-polling endpoints: 30000ms (30s) max
  - **Rationale**: ALB default idle timeout is 60s. Node timeouts must be shorter to prevent 502 errors

### Authentication Implementation

- **Device Authentication Flow**:
  - **Initial Auth** (`POST /api/v1/device/auth`):
    - Validate device ID and secret from request body
    - Check device status in database (active, suspended, etc.)
    - Generate session token (UUID v4) and store in Redis with 7-day TTL
    - Return session token for subsequent requests
    - Return 401 for invalid credentials, 403 for suspended devices
  - **Subsequent Requests** (`/api/v1/device/*`):
    - Require `X-Device-Token` header with session token
    - Validate token exists in Redis and hasn't expired
    - Refresh TTL on each successful request
    - Return 401 if token invalid or expired

- **Customer Authentication Path** (`/customer/*`):
  - Validate Supabase access JWT tokens only
  - Extract customer ID from JWT claims
  - Verify customer-device relationships for access control
  - Return 401 if token expired (client handles refresh via Supabase Auth)

### API Endpoint Structure

- **Device Endpoints** (`/api/v1/device/*`):
  - `POST /auth` - Authenticate and get session token
  - `POST /register` - Activate pre-provisioned device with activation code
  - `POST /heartbeat` - Status updates with metrics payload
  - `POST /commands/claim` - Claim commands with visibility timeout (SQS-like)
  - `POST /commands/:id/extend` - Extend visibility for long-running commands
  - `POST /commands/:id/result` - Submit results with claim token

- **Customer Endpoints** (`/api/v1/customer/*`):
  - `GET /devices` - List customer's registered devices
  - `GET /devices/:id/status` - Get specific device status
  - `POST /devices/provision` - Pre-provision device with activation code
  - `POST /sessions` - Create diagnostic session
  - `GET /sessions/:id` - Get session details and history
  - `POST /sessions/:id/approve` - Approve remediation action
  - `GET /system/info` - Detailed system info (authenticated only)

- **Health Endpoints** (public):
  - `GET /healthz` - Liveness check (always 200 if process running)
  - `GET /readyz` - Readiness check (503 if dependencies unhealthy)
  - `GET /version` - API version only (no sensitive info)

### WebSocket Implementation

- Fastify WebSocket plugin (`@fastify/websocket`)
- Separate WebSocket routes for devices and customers
- Message types: status updates, command execution, approval requests
- Automatic reconnection handling with exponential backoff
- Heartbeat/ping-pong for connection health
- **Connection Management**:
  - Track all active connections in memory (Map by connection ID)
  - Remove connections on disconnect or error
  - During shutdown: iterate all connections and send close frames
  - Close code 1001 (Going Away) with message "Server shutting down"
  - Client should reconnect to another instance after receiving close

### Database Integration

- Reuse existing Supabase client from `@aizen/shared`
- PostgREST API handles query parameterization automatically
- Built-in connection pooling via Supabase
- RPC functions for complex multi-table operations

### Redis Integration

- Session storage with configurable TTL (7d for device tokens)
- Activation codes with 24h TTL for device provisioning
- **Command Queue Implementation**:
  - Commands stored with visibility state: `pending`, `claimed`, `completed`
  - Claim tokens (UUID v4) with visibility timeout (default 5min)
  - Atomic claim operations using Redis transactions (WATCH/MULTI/EXEC)
  - Automatic visibility expiry returns commands to pending state
  - Command priority sorting with timestamp-based FIFO within priority levels
- WebSocket connection mapping for message routing
- Cache frequently accessed data (device status, customer metadata)

### Error Handling

- Standardized error response format: `{ error: { code, message, details } }`
- Custom error classes for different failure scenarios
- **Correlation ID Implementation**:
  - Header: `X-Request-ID` (client-provided or server-generated UUID v4)
  - Propagated to all log entries via Fastify request context
  - Included in error responses for support correlation
  - Passed to WebSocket messages as `requestId` field
  - Forwarded to downstream services (Supabase, Redis operations)
- Sensitive data sanitization in error messages

### Security Measures

- Device pre-provisioning prevents unauthorized customer association
- One-time activation codes with 24h expiry for device registration
- Input validation using Fastify JSON schemas
- SQL injection prevention via PostgREST's automatic parameterization
- XSS protection through proper content-type headers
- Simple CORS configuration allowing known origins
- Secrets management via environment variables

### Performance Considerations

- Connection pooling for database and Redis
- Request/response compression with `@fastify/compress`
- Efficient JSON serialization with Fastify's built-in optimizer
- Async/await patterns for non-blocking I/O

### ECS Health Check Integration

- **Liveness Check** (`/healthz`):
  - Used by ECS for container health monitoring
  - Returns 200 if Node.js process is running
  - Does NOT check dependencies (prevents cascading failures)
- **Readiness Check** (`/readyz`):
  - Used by ECS target group for traffic routing
  - Returns 503 until ALL dependencies are confirmed healthy:
    - Supabase: Execute `SELECT 1` query
    - Redis: Execute `PING` command
  - New tasks won't receive traffic until ready
  - Rolling deployments pause if new tasks aren't ready
  - Protects against deploying broken configurations

## External Dependencies

- **@fastify/websocket** - WebSocket support for real-time communication
  - **Justification:** Required for bidirectional real-time updates between devices and portal
  - **Version:** ^10.0.1 (compatible with Fastify 4.x)

- **@fastify/cors** - CORS handling middleware
  - **Justification:** Enable cross-origin requests from web portal
  - **Version:** ^9.0.1

- **@fastify/compress** - Response compression
  - **Justification:** Reduce bandwidth usage for API responses
  - **Version:** ^7.0.3

- **@fastify/rate-limit** - Rate limiting (for future use)
  - **Justification:** Foundation for future rate limiting implementation
  - **Version:** ^9.1.0 (install but don't configure yet)
