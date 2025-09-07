# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-07-customer-web-portal/spec.md

> Created: 2025-09-07
> Version: 1.0.0

## Endpoints

### Authentication & Authorization

#### POST /api/auth/login

**Purpose:** Authenticate user and establish session
**Parameters:**

- Body: { email: string, password: string }
  **Response:** { user: User, token: string, role: string }
  **Errors:** 401 Unauthorized, 400 Bad Request

#### GET /api/auth/me

**Purpose:** Get current user profile with role information
**Parameters:** None (uses session token)
**Response:** { user: User, role: string, customer_id: string }
**Errors:** 401 Unauthorized

#### POST /api/auth/logout

**Purpose:** Terminate user session
**Parameters:** None
**Response:** { success: boolean }
**Errors:** 401 Unauthorized

### Chat Management

#### POST /api/chat/sessions

**Purpose:** Create a new chat session
**Parameters:**

- Body: { title?: string }
  **Response:** { session_id: string, created_at: string }
  **Errors:** 401 Unauthorized, 403 Forbidden

#### GET /api/chat/sessions

**Purpose:** List all chat sessions for the user's organization
**Parameters:**

- Query: { status?: 'active' | 'closed' | 'archived', limit?: number, offset?: number }
  **Response:** { sessions: ChatSession[], total: number }
  **Errors:** 401 Unauthorized

#### GET /api/chat/sessions/:sessionId/messages

**Purpose:** Retrieve messages for a specific chat session
**Parameters:**

- Path: sessionId
- Query: { limit?: number, before?: string }
  **Response:** { messages: Message[], has_more: boolean }
  **Errors:** 401 Unauthorized, 404 Not Found

#### POST /api/chat/sessions/:sessionId/messages

**Purpose:** Send a message to the AI and receive response
**Parameters:**

- Path: sessionId
- Body: { content: string, metadata?: object }
  **Response:** { user_message: Message, ai_response: Message }
  **Errors:** 401 Unauthorized, 404 Not Found, 429 Rate Limited

### Device Management

#### GET /api/devices

**Purpose:** List all devices for the organization
**Parameters:**

- Query: { status?: 'online' | 'offline', limit?: number }
  **Response:** { devices: Device[], total: number }
  **Errors:** 401 Unauthorized, 403 Forbidden (viewers cannot access)

#### POST /api/devices

**Purpose:** Register a new device agent
**Parameters:**

- Body: { name: string, location?: string, configuration?: object }
  **Response:** { device_id: string, registration_token: string }
  **Errors:** 401 Unauthorized, 403 Forbidden (only admins/owner)

#### PUT /api/devices/:deviceId

**Purpose:** Update device configuration
**Parameters:**

- Path: deviceId
- Body: { name?: string, configuration?: object }
  **Response:** { device: Device }
  **Errors:** 401 Unauthorized, 403 Forbidden, 404 Not Found

#### GET /api/devices/:deviceId/actions

**Purpose:** Get device actions for a session
**Parameters:**

- Path: deviceId
- Query: { session_id?: string, status?: string }
  **Response:** { actions: DeviceAction[] }
  **Errors:** 401 Unauthorized, 404 Not Found

### AI Prompt Management (Owner Only)

#### GET /api/prompts

**Purpose:** List all AI prompt templates
**Parameters:**

- Query: { category?: string, is_active?: boolean }
  **Response:** { prompts: Prompt[] }
  **Errors:** 401 Unauthorized, 403 Forbidden

#### POST /api/prompts

**Purpose:** Create a new prompt template
**Parameters:**

- Body: { name: string, template: string, variables?: string[], category?: string }
  **Response:** { prompt_id: string }
  **Errors:** 401 Unauthorized, 403 Forbidden (owner only)

#### PUT /api/prompts/:promptId

**Purpose:** Update an existing prompt template
**Parameters:**

- Path: promptId
- Body: { name?: string, template?: string, variables?: string[], is_active?: boolean }
  **Response:** { prompt: Prompt }
  **Errors:** 401 Unauthorized, 403 Forbidden, 404 Not Found

### User Management

#### GET /api/users

**Purpose:** List users in the organization
**Parameters:**

- Query: { role?: string, limit?: number }
  **Response:** { users: User[], total: number }
  **Errors:** 401 Unauthorized, 403 Forbidden (admins/owner only)

#### POST /api/users/invite

**Purpose:** Invite a new user to the organization
**Parameters:**

- Body: { email: string, role: 'admin' | 'viewer' }
  **Response:** { invitation_id: string }
  **Errors:** 401 Unauthorized, 403 Forbidden (admins/owner only)

#### PUT /api/users/:userId/role

**Purpose:** Update user role within organization
**Parameters:**

- Path: userId
- Body: { role: 'admin' | 'viewer' }
  **Response:** { user: User }
  **Errors:** 401 Unauthorized, 403 Forbidden, 404 Not Found

### WebSocket Events

#### WS /api/ws

**Purpose:** Establish WebSocket connection for real-time updates
**Events:**

- Client → Server:
  - `join_session`: { session_id: string }
  - `leave_session`: { session_id: string }
  - `approve_action`: { action_id: string, approved: boolean }
- Server → Client:
  - `new_message`: { message: Message }
  - `device_action`: { action: DeviceAction }
  - `device_output`: { action_id: string, output: string }
  - `typing`: { session_id: string, is_typing: boolean }

## Controllers

### ChatController

- **createSession()**: Initialize new chat session with audit logging
- **sendMessage()**: Process user message, call Claude Code SDK, manage device actions
- **approveAction()**: Handle human-in-the-loop approval for device actions
- **Error Handling**: Rate limiting, session validation, permission checks

### DeviceController

- **registerDevice()**: Generate secure registration token, store device config
- **updateDevice()**: Validate configuration changes, update last_activity
- **executeAction()**: Queue device commands, track execution status
- **Error Handling**: Device availability checks, command validation

### PromptController

- **managePrompts()**: CRUD operations for prompt templates
- **validateTemplate()**: Check template syntax and variable placeholders
- **Error Handling**: Owner-only access, template validation errors

### UserController

- **inviteUser()**: Send invitation email, create pending user record
- **updateRole()**: Validate role changes, update permissions
- **Error Handling**: Organization isolation, role hierarchy validation

## Integration Points

- **Claude Code SDK**: Backend proxies all AI requests, sanitizes data before sending
- **Supabase Realtime**: Subscribe to database changes for live updates
- **Redis**: Cache active sessions and device states for performance
- **Device Agent API**: Separate endpoint for device-to-cloud communication
