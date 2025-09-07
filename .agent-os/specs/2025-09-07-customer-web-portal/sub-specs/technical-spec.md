# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-07-customer-web-portal/spec.md

> Created: 2025-09-07
> Version: 1.0.0

## Technical Requirements

### Frontend Architecture

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript 5.9.2 in strict mode
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: Zustand for client state, React Query for server state
- **Real-time Communication**: WebSocket connection to API for chat and device updates
- **Authentication**: Supabase Auth integration with role-based route protection

### UI/UX Specifications

- **Layout**: Sidebar navigation with "Chat" and "Settings" menu items
- **Chat Interface**:
  - Message input with send button
  - Scrollable chat history with user/AI message differentiation
  - Typing indicators and message status (sending, sent, error)
  - Approval/rejection buttons for AI-suggested actions inline in chat
- **Device Action Modal**:
  - Floating modal that can be minimized/expanded
  - Real-time console output from device agent
  - Color-coded output for different log levels
  - Persistent across page navigation within chat session
- **Settings Interface**:
  - User management table with role assignment
  - Device registration form with validation
  - Prompt template editor (owner-only, Monaco editor for syntax highlighting)

### Integration Requirements

- **API Gateway**: Connect to existing Fastify API endpoints
- **Authentication**: Supabase client SDK for auth flows
- **WebSocket**: Socket.io client for real-time updates
- **Claude Code SDK**: API calls routed through backend, no direct SDK usage in frontend
- **Device Agent Communication**: Subscribe to device-specific channels for output streaming

### Performance Criteria

- **Initial Load**: First Contentful Paint < 1.5s
- **Chat Latency**: Message send to AI response < 2s (excluding AI processing time)
- **WebSocket Reconnection**: Automatic with exponential backoff
- **Session Persistence**: Chat history cached locally with IndexedDB
- **Responsive Design**: Mobile-first approach, works on devices 320px and up

### Security Requirements

- **CSP Headers**: Strict Content Security Policy
- **Input Sanitization**: XSS protection on all user inputs
- **Rate Limiting**: Frontend-enforced limits on API calls
- **Secure Storage**: Sensitive data never stored in localStorage
- **HTTPS Only**: Enforce secure connections

## Approach

### Component Architecture

The web portal will follow a component-driven architecture with clear separation of concerns:

1. **Layout Components**: Navigation sidebar, main content area, modal container
2. **Chat Components**: Message list, message input, typing indicators, action buttons
3. **Settings Components**: User management, device registration, prompt editor
4. **Shared Components**: Buttons, forms, modals from shadcn/ui library

### State Management Strategy

- **Global State (Zustand)**: User session, device connection status, UI state (modal visibility)
- **Server State (React Query)**: API data caching, background refetching, optimistic updates
- **Local State**: Component-specific state using React hooks
- **WebSocket State**: Real-time data through custom hooks wrapping socket.io client

### Real-time Communication Flow

1. Client establishes WebSocket connection on login
2. Subscribe to user-specific and device-specific channels
3. Handle incoming messages (chat responses, device outputs, status updates)
4. Implement reconnection logic with exponential backoff
5. Graceful degradation if WebSocket unavailable

## External Dependencies

- **@supabase/supabase-js** (^2.56.0) - Authentication and database client
- **socket.io-client** (^4.8.0) - WebSocket connection for real-time updates
- **@tanstack/react-query** (^5.62.0) - Server state management and caching
- **zustand** (^5.0.0) - Client-side state management
- **shadcn/ui** - UI component library built on Radix UI
- **@monaco-editor/react** (^4.6.0) - Code editor for prompt templates (owner view only)
- **react-markdown** (^9.0.0) - Rendering AI responses with markdown support
- **Justification**: These libraries provide production-ready solutions for real-time communication, state management, and UI components that align with our performance and security requirements
