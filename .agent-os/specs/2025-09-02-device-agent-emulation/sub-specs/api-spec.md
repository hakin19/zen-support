# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-02-device-agent-emulation/spec.md

## Endpoints

### POST /api/v1/devices/register

**Purpose:** Register a new device agent with the cloud service
**Parameters:** 
- Body: `{ deviceId: string, deviceSecret: string, customerId: string, metadata: object }`
**Response:** 
- Success (200): `{ success: true, token: string, expiresIn: number, heartbeatInterval: number }`
- Error (401): `{ error: "Invalid device credentials" }`
- Error (409): `{ error: "Device already registered" }`
**Errors:** 401 Unauthorized, 409 Conflict, 500 Internal Server Error

### POST /api/v1/devices/:deviceId/heartbeat

**Purpose:** Maintain device connection status and receive pending commands
**Parameters:**
- Path: `deviceId` - Unique device identifier
- Headers: `Authorization: Bearer <token>`
- Body: `{ status: 'online' | 'idle' | 'busy', metrics: object }`
**Response:**
- Success (200): `{ acknowledged: true, commands: DiagnosticCommand[], nextHeartbeat: number }`
- Error (401): `{ error: "Invalid or expired token" }`
- Error (404): `{ error: "Device not found" }`
**Errors:** 401 Unauthorized, 404 Not Found, 500 Internal Server Error

### POST /api/v1/devices/:deviceId/diagnostic-results

**Purpose:** Submit results from executed diagnostic commands
**Parameters:**
- Path: `deviceId` - Unique device identifier  
- Headers: `Authorization: Bearer <token>`
- Body: `{ commandId: string, status: 'completed' | 'failed' | 'timeout', results: object, executedAt: string, duration: number }`
**Response:**
- Success (200): `{ received: true, nextCommand?: DiagnosticCommand }`
- Error (400): `{ error: "Invalid result format" }`
- Error (404): `{ error: "Command not found" }`
**Errors:** 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Server Error

### GET /api/v1/devices/:deviceId/commands

**Purpose:** Retrieve pending diagnostic commands for the device
**Parameters:**
- Path: `deviceId` - Unique device identifier
- Headers: `Authorization: Bearer <token>`
- Query: `limit` (optional) - Maximum number of commands to retrieve
**Response:**
- Success (200): `{ commands: DiagnosticCommand[], count: number }`
- Error (401): `{ error: "Invalid or expired token" }`
**Errors:** 401 Unauthorized, 404 Not Found, 500 Internal Server Error

### POST /api/v1/devices/:deviceId/status

**Purpose:** Update device status and report errors or issues
**Parameters:**
- Path: `deviceId` - Unique device identifier
- Headers: `Authorization: Bearer <token>`
- Body: `{ status: 'online' | 'offline' | 'error' | 'maintenance', message?: string, metadata?: object }`
**Response:**
- Success (200): `{ updated: true, timestamp: string }`
- Error (400): `{ error: "Invalid status" }`
**Errors:** 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Server Error

## Data Models

### DiagnosticCommand

```typescript
interface DiagnosticCommand {
  id: string;
  type: 'ping' | 'traceroute' | 'dns' | 'connectivity' | 'custom';
  parameters: {
    target?: string;
    count?: number;
    timeout?: number;
    port?: number;
    recordType?: string;
    customCommand?: string;
  };
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  expiresAt: string;
}
```

### DiagnosticResult

```typescript
interface DiagnosticResult {
  commandId: string;
  deviceId: string;
  status: 'completed' | 'failed' | 'timeout';
  results: {
    output?: string;
    metrics?: object;
    error?: string;
  };
  executedAt: string;
  duration: number;
  sanitized: boolean;
}
```

## Controllers

### DeviceController

**Actions:**
- `register()` - Validate device credentials, create session, return JWT token
- `heartbeat()` - Update last seen timestamp, check command queue, return pending commands
- `submitResults()` - Validate and store diagnostic results, trigger analysis if needed
- `getCommands()` - Retrieve prioritized command queue for device
- `updateStatus()` - Update device status in database, trigger alerts if needed

### AuthMiddleware

**Actions:**
- `validateToken()` - Verify JWT token, check expiration, refresh if needed
- `authorizeDevice()` - Ensure device belongs to customer, check permissions
- `rateLimiting()` - Implement rate limits per device to prevent abuse

## WebSocket Support (Future Enhancement)

### WS /api/v1/devices/:deviceId/stream

**Purpose:** Real-time bidirectional communication for live diagnostics
**Protocol:** WebSocket with JWT authentication
**Messages:**
- Client → Server: `{ type: 'auth', token: string }`
- Server → Client: `{ type: 'command', command: DiagnosticCommand }`
- Client → Server: `{ type: 'result', result: DiagnosticResult }`
- Server → Client: `{ type: 'ack', commandId: string }`

## Error Handling

All endpoints follow consistent error response format:

```typescript
interface ErrorResponse {
  error: string;
  code?: string;
  details?: object;
  timestamp: string;
  requestId: string;
}
```

## Rate Limiting

- Device registration: 5 attempts per hour per IP
- Heartbeat: 1 per 10 seconds per device
- Result submission: 100 per minute per device
- Command retrieval: 10 per minute per device
- Status updates: 20 per minute per device

## Security Considerations

- All endpoints require HTTPS
- JWT tokens expire after 24 hours
- Device secrets are never returned in responses
- Result data is sanitized before storage
- Rate limiting prevents abuse
- Audit logging for all device actions