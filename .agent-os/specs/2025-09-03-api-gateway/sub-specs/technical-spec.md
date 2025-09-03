# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-03-api-gateway/spec.md

## Technical Requirements

### Framework Configuration

- Fastify server with built-in logger and JSON schema validation
- Trust proxy configuration for proper IP handling behind load balancers
- Graceful shutdown handlers for SIGTERM/SIGINT signals
- Environment-based configuration using existing config patterns

### Authentication Implementation

- **Device Authentication Path** (`/device/*`):
  - Validate device ID and secret from headers or query params
  - Check device status in database (active, suspended, etc.)
  - Create session token stored in Redis with TTL
  - Return 401 for invalid credentials, 403 for suspended devices

- **Customer Authentication Path** (`/customer/*`):
  - Integrate with Supabase Auth for token validation
  - Extract customer ID from JWT claims
  - Verify customer-device relationships for access control
  - Handle session refresh tokens

### API Endpoint Structure

- **Device Endpoints** (`/api/v1/device/*`):
  - `POST /register` - Initial device registration with customer ID
  - `POST /heartbeat` - Status updates with metrics payload
  - `GET /commands` - Poll for pending diagnostic commands
  - `POST /commands/:id/result` - Submit command execution results

- **Customer Endpoints** (`/api/v1/customer/*`):
  - `GET /devices` - List customer's registered devices
  - `GET /devices/:id/status` - Get specific device status
  - `POST /sessions` - Create diagnostic session
  - `GET /sessions/:id` - Get session details and history
  - `POST /sessions/:id/approve` - Approve remediation action

- **Health Endpoints** (public):
  - `GET /healthz` - Basic health check
  - `GET /readyz` - Readiness with dependency checks
  - `GET /version` - API version and build info

### WebSocket Implementation

- Fastify WebSocket plugin (`@fastify/websocket`)
- Separate WebSocket routes for devices and customers
- Message types: status updates, command execution, approval requests
- Automatic reconnection handling with exponential backoff
- Heartbeat/ping-pong for connection health

### Database Integration

- Reuse existing Supabase client from `@aizen/shared`
- Connection pooling with appropriate limits
- Prepared statements for frequent queries
- Transaction support for multi-table operations

### Redis Integration

- Session storage with configurable TTL (default 24h for customers, 7d for devices)
- Command queue for device diagnostic tasks
- WebSocket connection mapping for message routing
- Cache frequently accessed data (device status, customer metadata)

### Error Handling

- Standardized error response format: `{ error: { code, message, details } }`
- Custom error classes for different failure scenarios
- Logging with correlation IDs for request tracing
- Sensitive data sanitization in error messages

### Security Measures

- Input validation using Fastify JSON schemas
- SQL injection prevention via parameterized queries
- XSS protection through proper content-type headers
- Simple CORS configuration allowing known origins
- Secrets management via environment variables

### Performance Considerations

- Connection pooling for database and Redis
- Request/response compression with `@fastify/compress`
- Efficient JSON serialization with Fastify's built-in optimizer
- Async/await patterns for non-blocking I/O

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
