# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-03-api-gateway/spec.md

## Authentication Headers

All authenticated endpoints require appropriate headers:

- **Device endpoints**: `X-Device-ID` and `X-Device-Secret`
- **Customer endpoints**: `Authorization: Bearer <supabase-jwt-token>`

## Endpoints

### POST /api/v1/device/register

**Purpose:** Register a new device with the system
**Parameters:**

- Body: `{ deviceId: string, deviceSecret: string, customerId: string, metadata?: { location?: string, model?: string } }`
  **Response:** `{ success: boolean, device: { id: string, status: string, registeredAt: string } }`
  **Errors:**
- 400: Invalid request body
- 401: Invalid device credentials
- 409: Device already registered

### POST /api/v1/device/heartbeat

**Purpose:** Send periodic status update from device
**Parameters:**

- Body: `{ timestamp: string, status: 'online' | 'busy' | 'error', metrics?: { cpu: number, memory: number, uptime: number }, diagnostics?: any }`
  **Response:** `{ success: boolean, nextHeartbeat: number (ms), pendingCommands?: number }`
  **Errors:**
- 401: Invalid device authentication
- 404: Device not found
- 503: Service temporarily unavailable

### GET /api/v1/device/commands

**Purpose:** Poll for pending diagnostic commands
**Parameters:**

- Query: `?limit=10&timeout=30000` (long polling support)
  **Response:** `{ commands: [{ id: string, type: string, parameters: any, priority: number, expiresAt: string }] }`
  **Errors:**
- 401: Invalid device authentication
- 404: Device not found

### POST /api/v1/device/commands/:id/result

**Purpose:** Submit command execution results
**Parameters:**

- Path: `id` - Command ID
- Body: `{ status: 'success' | 'failure' | 'timeout', output?: string, error?: string, executedAt: string, duration: number }`
  **Response:** `{ success: boolean, nextCommand?: { id: string } }`
  **Errors:**
- 401: Invalid device authentication
- 404: Command not found
- 409: Command already processed

### GET /api/v1/customer/devices

**Purpose:** List all devices registered to the customer
**Parameters:**

- Query: `?status=online|offline|all&limit=50&offset=0`
  **Response:** `{ devices: [{ id: string, name: string, status: string, lastSeen: string, location?: string }], total: number }`
  **Errors:**
- 401: Invalid customer authentication
- 403: Insufficient permissions

### GET /api/v1/customer/devices/:id/status

**Purpose:** Get detailed status of a specific device
**Parameters:**

- Path: `id` - Device ID
  **Response:** `{ device: { id: string, status: string, lastHeartbeat: string, metrics: any, diagnostics: any, activeSession?: string } }`
  **Errors:**
- 401: Invalid customer authentication
- 403: Device not owned by customer
- 404: Device not found

### POST /api/v1/customer/sessions

**Purpose:** Create a new diagnostic session
**Parameters:**

- Body: `{ deviceId: string, type: 'diagnostic' | 'remediation', description?: string }`
  **Response:** `{ session: { id: string, deviceId: string, status: 'active', createdAt: string, expiresAt: string } }`
  **Errors:**
- 401: Invalid customer authentication
- 403: Device not owned by customer
- 404: Device not found
- 409: Active session already exists

### GET /api/v1/customer/sessions/:id

**Purpose:** Get session details and command history
**Parameters:**

- Path: `id` - Session ID
  **Response:** `{ session: { id: string, status: string, commands: [{ id: string, type: string, status: string, result?: any }], createdAt: string } }`
  **Errors:**
- 401: Invalid customer authentication
- 403: Session not owned by customer
- 404: Session not found

### POST /api/v1/customer/sessions/:id/approve

**Purpose:** Approve a pending remediation action
**Parameters:**

- Path: `id` - Session ID
- Body: `{ commandId: string, approved: boolean, reason?: string }`
  **Response:** `{ success: boolean, command: { id: string, status: 'approved' | 'rejected' } }`
  **Errors:**
- 401: Invalid customer authentication
- 403: Session not owned by customer
- 404: Session or command not found
- 409: Command already processed

### GET /healthz

**Purpose:** Basic health check for load balancer/monitoring
**Parameters:** None
**Response:** `{ status: 'ok', timestamp: string }`
**Errors:** None (always returns 200 if server is running)

### GET /readyz

**Purpose:** Readiness check including dependency validation
**Parameters:** None
**Response:** `{ ready: boolean, checks: { database: boolean, redis: boolean, services: boolean } }`
**Errors:**

- 503: Service not ready (one or more dependencies failing)

### GET /version

**Purpose:** API version and build information
**Parameters:** None
**Response:** `{ version: string, build: string, environment: string }`
**Errors:** None

## WebSocket Endpoints

### WS /ws/device

**Purpose:** Real-time bidirectional communication for devices
**Authentication:** Device ID and secret in connection query params
**Message Types:**

- Client → Server: `{ type: 'status', data: any }`, `{ type: 'command_result', data: any }`
- Server → Client: `{ type: 'command', data: any }`, `{ type: 'config_update', data: any }`

### WS /ws/customer

**Purpose:** Real-time updates for customer portal
**Authentication:** Supabase JWT in connection query params
**Message Types:**

- Client → Server: `{ type: 'subscribe', deviceId: string }`, `{ type: 'unsubscribe', deviceId: string }`
- Server → Client: `{ type: 'device_status', data: any }`, `{ type: 'command_update', data: any }`

## Error Response Format

All errors follow this standard format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context if applicable"
    }
  }
}
```

## Rate Limiting (Future)

Rate limits will be implemented in a future phase:

- Device endpoints: 100 requests/minute per device
- Customer endpoints: 1000 requests/minute per customer
- WebSocket messages: 10 messages/second per connection
