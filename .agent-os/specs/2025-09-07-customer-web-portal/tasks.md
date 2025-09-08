# Spec Tasks

## Tasks

- [x] 1. Research and Setup Claude Code SDK Integration
  - [x] 1.1 Read full Claude Code SDK documentation via context7 MCP tool
  - [x] 1.2 Write tests for Claude Code SDK service wrapper
  - [x] 1.3 Create Claude Code SDK service class in @aizen/api
  - [x] 1.4 Implement prompt template management system
  - [x] 1.5 Set up environment variables for Claude Code SDK configuration
  - [x] 1.6 Verify all tests pass

- [x] 2. Database Schema and Authentication Setup
  - [x] 2.1 Write tests for database migrations and RLS policies
  - [x] 2.2 Create database migration for user_roles table
  - [x] 2.3 Create migrations for chat_sessions and chat_messages tables
  - [x] 2.4 Create migrations for ai_prompts and device_actions tables
  - [x] 2.5 Implement Row Level Security policies
  - [x] 2.6 Update Supabase types generation
  - [x] 2.7 Implement authentication middleware with role checking
  - [x] 2.8 Verify all tests pass

- [x] 3. Next.js Web Portal Foundation
  - [x] 3.1 Write tests for layout and navigation components
  - [x] 3.2 Initialize Next.js 14 app in packages/web
  - [x] 3.3 Configure Tailwind CSS and shadcn/ui
  - [x] 3.4 Create base layout with sidebar navigation (Chat, Settings)
  - [x] 3.5 Implement Supabase authentication integration
  - [x] 3.6 Create protected route middleware with role-based access
  - [x] 3.7 Set up Zustand store for client state management
  - [x] 3.8 Verify all tests pass

- [ ] 4. Chat Realtime & Backend Integration
  - [ ] 4.1 Write tests for WebSocket client and backend handlers
  - [ ] 4.2 Implement native WebSocket client (reconnect, heartbeat, routing)
  - [ ] 4.3 Add REST/SSE endpoints for chat sessions and messages (persist to Supabase)
  - [ ] 4.4 Integrate Claude Code SDK streaming via API (SSE or WS)
  - [ ] 4.5 Wire Redis pub/sub fanout for session channels
  - [ ] 4.6 Verify all tests pass

- [ ] 5. Chat UI & Device Actions
  - [ ] 5.1 Write tests for chat components and client state store
  - [ ] 5.2 Build chat UI components (message list, input, status indicators)
  - [ ] 5.3 Implement client chat session management (create/select, load history)
  - [ ] 5.4 Implement device action modal (expandable/collapsible)
  - [ ] 5.5 Add approval/rejection UI for AI-suggested actions
  - [ ] 5.6 Verify all tests pass

- [ ] 6. Settings and Admin Features
  - [ ] 6.1 Write tests for settings components and user management
  - [ ] 6.2 Create user management interface (list, invite, role assignment)
  - [ ] 6.3 Implement device registration and configuration UI
  - [ ] 6.4 Create AI prompt template editor (owner-only with Monaco editor)
  - [ ] 6.5 Add organization settings management
  - [ ] 6.6 Implement role-based visibility controls
  - [ ] 6.7 Verify all tests pass
