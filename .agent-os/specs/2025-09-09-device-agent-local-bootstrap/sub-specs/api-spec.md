# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-09-device-agent-local-bootstrap/spec.md

## Endpoints

### POST /api/v1/device/auth

**Purpose:** Authenticate a device and obtain a session token for subsequent API calls

**Parameters:**

- Body (JSON):
  - `deviceId` (string, required): Unique identifier for the device
  - `deviceSecret` (string, required): Secret key for device authentication

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "string",
    "expiresIn": 86400,
    "deviceId": "string"
  }
}
```

**Errors:**

- 401: Invalid credentials - `{ error: "Invalid device credentials" }`
- 400: Missing parameters - `{ error: "deviceId and deviceSecret are required" }`
- 500: Server error - `{ error: "Internal server error" }`

### POST /api/v1/device/heartbeat

**Purpose:** Submit device health status and metrics to maintain online presence

**Parameters:**

- Headers:
  - `X-Device-Token` or `Authorization: Bearer {token}` (string, required): Device session token
- Body (JSON):
  - `status` (string, required): Device health status - "healthy" | "degraded" | "offline"
  - `metrics` (object, optional): Device performance metrics
    - `cpu` (number): CPU usage percentage (0-100)
    - `memory` (number): Memory usage percentage (0-100)
    - `uptime` (number): Device uptime in seconds

**Response:**

```json
{
  "success": true,
  "data": {
    "received": true,
    "timestamp": "2025-09-09T10:00:00Z",
    "nextHeartbeat": 30000
  }
}
```

**Errors:**

- 401: Invalid or expired token - `{ error: "Invalid session token" }`
- 400: Invalid request body - `{ error: "Invalid status or metrics format" }`
- 500: Server error - `{ error: "Failed to process heartbeat" }`

### GET /api/v1/device/ws

**Purpose:** Establish WebSocket connection for real-time bidirectional communication

**Parameters:**

- Headers:
  - `X-Device-Session` (string, required): Device session token for authentication
- Query (optional):
  - `reconnect` (boolean): Indicates if this is a reconnection attempt

**WebSocket Messages:**

#### Server → Agent Messages

```json
{
  "type": "connected",
  "payload": {
    "sessionId": "string",
    "timestamp": "2025-09-09T10:00:00Z"
  }
}
```

```json
{
  "type": "command",
  "payload": {
    "commandId": "string",
    "action": "string",
    "parameters": {}
  }
}
```

#### Agent → Server Messages

```json
{
  "type": "heartbeat",
  "payload": {
    "timestamp": "2025-09-09T10:00:00Z"
  }
}
```

```json
{
  "type": "command_result",
  "payload": {
    "commandId": "string",
    "status": "acknowledged" | "completed" | "failed",
    "result": {}
  }
}
```

**Errors:**

- 401: Authentication failed - Connection closed with code 4001
- 400: Invalid message format - Connection closed with code 4000
- 500: Server error - Connection closed with code 1011

### GET /health

**Purpose:** Health check endpoint for monitoring API availability

**Parameters:** None

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-09-09T10:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

**Errors:**

- 503: Service unavailable - `{ status: "unhealthy", error: "Service dependencies not available" }`

## Controllers

### DeviceAuthController

- **authenticate()**: Validates device credentials, generates session token, stores in Redis
- **validateSession()**: Middleware to check token validity on protected endpoints
- **refreshSession()**: Updates session TTL on activity

### DeviceHeartbeatController

- **processHeartbeat()**: Updates device last_seen, stores metrics, publishes status change events
- **calculateDeviceStatus()**: Determines device online/offline based on heartbeat recency
- **storeMetrics()**: Persists device metrics to time-series storage

### WebSocketController

- **handleConnection()**: Authenticates WebSocket upgrade, initializes session
- **handleMessage()**: Routes incoming messages to appropriate handlers
- **broadcastToDevice()**: Sends targeted messages to specific device connections
- **handleDisconnect()**: Cleans up session, updates device status

## Integration Points

### Redis Session Storage

- Key pattern: `session:{token}`
- TTL: 24 hours, refreshed on activity
- Data structure: Hash with deviceId, createdAt, lastActivity

### Database Updates

- Device table: last_seen, status, online fields
- Metrics table: time-series storage of CPU, memory, uptime
- Audit log: Authentication attempts, command execution

### Event Publishing

- Device online/offline events published to WebSocket subscribers
- Heartbeat received events for monitoring dashboards
- Command execution results for audit trail
