# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-03-api-gateway/spec.md

## Authentication Headers

All authenticated endpoints require appropriate headers:

- **Device endpoints**: `X-Device-Token: <session-token>` (obtained from /api/v1/device/auth)
- **Customer endpoints**: `Authorization: Bearer <supabase-jwt-token>`

## Endpoints

### POST /api/v1/device/auth

**Purpose:** Authenticate device and obtain session token
**Parameters:**

- Body: `{ deviceId: string, deviceSecret: string }`
  **Response:** `{ token: string, expiresIn: number (seconds), deviceId: string }`
  **Errors:**
- 401: Invalid device credentials
- 403: Device suspended or inactive
- 429: Too many auth attempts

### POST /api/v1/device/register

**Purpose:** Register a pre-provisioned device with the system
**Parameters:**

- Body: `{ deviceId: string, activationCode: string, metadata?: { location?: string, model?: string } }`
  **Response:** `{ success: boolean, device: { id: string, status: string, customerId: string, registeredAt: string } }`
  **Errors:**
- 400: Invalid request body
- 401: Invalid activation code
- 404: Device not pre-provisioned
- 409: Device already registered

**Note:** Device must be pre-provisioned in database with customer association. Activation code is a one-time use token generated during device provisioning by customer.

### POST /api/v1/device/heartbeat

**Purpose:** Send periodic status update from device
**Parameters:**

- Body: `{ timestamp: string, status: 'online' | 'busy' | 'error', metrics?: { cpu: number, memory: number, uptime: number }, diagnostics?: any }`
  **Response:** `{ success: boolean, nextHeartbeat: number (ms), pendingCommands?: number }`
  **Errors:**
- 401: Invalid device authentication
- 404: Device not found
- 503: Service temporarily unavailable

### POST /api/v1/device/commands/claim

**Purpose:** Claim pending commands for exclusive processing (SQS-like semantics)
**Parameters:**

- Body: `{ limit: number (default: 1, max: 10), visibilityTimeout?: number (default: 300000ms = 5min) }`
  **Response:** `{ commands: [{ id: string, type: string, parameters: any, priority: number, claimToken: string, visibleUntil: string }] }`
  **Errors:**
- 401: Invalid device authentication
- 404: Device not found

**Note:** Commands are reserved exclusively for this device until visibilityTimeout expires. Use claimToken in result submission.

### POST /api/v1/device/commands/:id/extend

**Purpose:** Extend visibility timeout for long-running command
**Parameters:**

- Path: `id` - Command ID
- Body: `{ claimToken: string, extensionMs: number (max: 300000) }`
  **Response:** `{ success: boolean, visibleUntil: string }`
  **Errors:**
- 401: Invalid device authentication
- 403: Invalid claim token or command expired
- 404: Command not found

### POST /api/v1/device/commands/:id/result

**Purpose:** Submit command execution results and release claim
**Parameters:**

- Path: `id` - Command ID
- Body: `{ claimToken: string, status: 'success' | 'failure' | 'timeout', output?: string, error?: string, executedAt: string, duration: number }`
  **Response:** `{ success: boolean, nextCommand?: { id: string } }`
  **Errors:**
- 401: Invalid device authentication
- 403: Invalid claim token or visibility expired
- 404: Command not found
- 409: Command already completed by another claim

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

### POST /api/v1/customer/devices/provision

**Purpose:** Pre-provision a new device for the customer
**Parameters:**

- Body: `{ deviceId: string, name?: string, location?: string }`
  **Response:** `{ device: { id: string, activationCode: string, expiresAt: string }, instructions: string }`
  **Errors:**
- 401: Invalid customer authentication
- 409: Device ID already exists

**Note:** Generates a one-time activation code valid for 24 hours. Customer provides this code to device during physical setup.

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

### GET /api/v1/customer/system/info

**Purpose:** Get detailed system information (authenticated)
**Parameters:** None
**Response:** `{ version: string, build: string, environment: string, uptime: number, services: object }`
**Errors:**

- 401: Invalid customer authentication

**Note:** Available only to authenticated customers for debugging and support purposes.

### GET /healthz

**Purpose:** Basic health check for load balancer/monitoring
**Parameters:** None
**Response:** `{ status: 'ok', timestamp: string }`
**Errors:** None (always returns 200 if server is running)

### GET /readyz

**Purpose:** Readiness check for ECS target group health validation
**Parameters:** None
**Response (200 OK):** `{ ready: true, checks: { database: true, redis: true } }`
**Response (503 Service Unavailable):** `{ ready: false, checks: { database: boolean, redis: boolean }, errors: string[] }`

**Behavior:**

- Returns 200 ONLY when ALL dependencies are healthy
- Returns 503 if ANY dependency check fails
- ECS uses this endpoint for task health checks
- Checks performed:
  - Database: Supabase connection and simple query
  - Redis: PING command response

**Note:** ECS will not route traffic to instances returning 503. New deployments won't complete until readiness passes.

### GET /version

**Purpose:** API version information (public endpoint)
**Parameters:** None
**Response:** `{ version: string }`
**Errors:** None

**Note:** Returns only version number for security. Detailed build info available via authenticated endpoints only.

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
