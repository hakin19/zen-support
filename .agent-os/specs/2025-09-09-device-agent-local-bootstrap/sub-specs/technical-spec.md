# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-09-device-agent-local-bootstrap/spec.md

## Technical Requirements

### Authentication Flow

- Device Agent sends POST request to `/api/v1/device/auth` with JSON body: `{ deviceId: string, deviceSecret: string }`
- API validates credentials against database and generates session token
- Session stored in Redis under key `session:{token}` with device metadata
- Agent stores token for use in subsequent requests

### Heartbeat Implementation

- POST to `/api/v1/device/heartbeat` at configurable interval (default 30 seconds)
- Request headers: `X-Device-Token: {token}` or `Authorization: Bearer {token}`
- Request body: `{ status: "healthy" | "degraded" | "offline", metrics: { cpu: number, memory: number, uptime: number } }`
- API updates device record with last_seen timestamp and status
- Metrics stored in time-series format for historical tracking

### WebSocket Protocol

- Connect to `/api/v1/device/ws` with device session token in `X-Device-Session` header
- Message types:
  - `connected`: Server acknowledges successful connection
  - `heartbeat`: Agent sends keepalive (separate from HTTP heartbeat)
  - `command`: Server sends command to agent (stub implementation)
  - `command_result`: Agent acknowledges command receipt
- Automatic reconnection with exponential backoff on disconnect
- Message format: JSON with `type` and `payload` fields

### Environment Configuration

#### Device Agent Environment Variables

- `MOCK_MODE`: true|false - Enable mock mode for testing without API
- `API_URL`: Base URL for API (default: http://host.docker.internal:3001)
- `DEVICE_ID`: Unique device identifier
- `DEVICE_SECRET`: Authentication secret
- `HEARTBEAT_INTERVAL`: Milliseconds between heartbeats (default: 30000)
- `LOG_LEVEL`: debug|info|warn|error (default: info)
- `BACKOFF_INITIAL`: Initial backoff delay in ms (default: 1000)
- `BACKOFF_MAX`: Maximum backoff delay in ms (default: 60000)
- `BACKOFF_MULTIPLIER`: Backoff multiplier (default: 2)

#### API Environment Variables

- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase (map from SUPABASE_SERVICE_KEY if exists)
- `REDIS_URL`: Redis connection string (default: redis://localhost:6379)
- `PORT`: API port (default: 3001)
- `NODE_ENV`: development|production

### Docker Configuration

#### Device Agent Dockerfile

- Base image: node:20-alpine
- Health check endpoint: GET /health returns `{ status: "healthy", uptime: number }`
- Working directory: /app
- User: non-root node user
- Volume mounts: config files and logs

#### Docker Compose Services

- Redis: Latest stable version with persistence disabled for local dev
- Device Agent: Build from packages/device-agent with environment file
- Network: Bridge network with service discovery
- Platform-specific host resolution:
  - Mac/Windows: `host.docker.internal` works out of the box
  - Linux: Add `--add-host=host.docker.internal:host-gateway` or use host IP

### Local Development Setup

#### Quick Start Commands

```bash
# Start Redis
docker-compose up -d redis

# Start API (in separate terminal)
cd packages/api
npm run dev

# Start Web (in separate terminal)
cd packages/web
npm run dev

# Start Device Agent
docker-compose up device-agent
```

#### Full Docker Compose Setup

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']

  device-agent:
    build: ./packages/device-agent
    environment:
      - API_URL=http://host.docker.internal:3001
      - MOCK_MODE=false
    extra_hosts:
      - 'host.docker.internal:host-gateway'
    depends_on:
      redis:
        condition: service_healthy
```

### Session Management

- Sessions stored in Redis with TTL of 24 hours
- Key format: `session:{token}` (not `device:session:{token}`)
- Session data includes: deviceId, createdAt, lastActivity, metadata
- Token generation uses cryptographically secure random bytes
- Session validation checks token existence and TTL refresh on activity

### Error Handling

- Connection failures trigger exponential backoff retry
- Invalid authentication returns 401 with clear error message
- Network timeouts configurable per endpoint
- Graceful shutdown on SIGTERM/SIGINT signals
- Comprehensive error logging with correlation IDs

### Performance Considerations

- Heartbeat requests should complete within 1 second
- WebSocket ping/pong interval set to 30 seconds
- Connection pooling for Redis and database
- Minimal memory footprint for Device Agent (< 50MB)
- CPU usage under 5% during idle with heartbeats
