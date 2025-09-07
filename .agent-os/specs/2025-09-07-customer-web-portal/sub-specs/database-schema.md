# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-09-07-customer-web-portal/spec.md

> Created: 2025-09-07
> Version: 1.0.0

## Schema Changes

### New Tables

#### user_roles

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, customer_id)
);
```

#### chat_sessions

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### chat_messages

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'ai', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### ai_prompts

```sql
CREATE TABLE ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### device_actions

```sql
CREATE TABLE device_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id),
  action_type TEXT NOT NULL,
  command TEXT,
  output TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'approved', 'rejected')),
  approval_required BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Modifications to Existing Tables

#### customers table

```sql
-- Add column for organization settings
ALTER TABLE customers ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
```

#### devices table

```sql
-- Add columns for configuration and last activity
ALTER TABLE devices ADD COLUMN IF NOT EXISTS configuration JSONB DEFAULT '{}';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
```

## Indexes and Constraints

```sql
-- Performance indexes
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_customer_id ON user_roles(customer_id);
CREATE INDEX idx_chat_sessions_customer_id ON chat_sessions(customer_id);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_device_actions_session_id ON device_actions(session_id);
CREATE INDEX idx_device_actions_device_id ON device_actions(device_id);

-- Foreign key relationships are defined inline with table creation
```

## Row Level Security (RLS) Policies

```sql
-- Enable RLS on all new tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_actions ENABLE ROW LEVEL SECURITY;

-- User roles policies
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles in their organization" ON user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.customer_id = user_roles.customer_id
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Chat sessions policies
CREATE POLICY "Users can view sessions in their organization" ON chat_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND customer_id = chat_sessions.customer_id
    )
  );

-- Chat messages policies
CREATE POLICY "Users can view messages in their organization's sessions" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN user_roles ur ON ur.customer_id = cs.customer_id
      WHERE cs.id = chat_messages.session_id
      AND ur.user_id = auth.uid()
    )
  );

-- AI prompts policies
CREATE POLICY "Only owners can manage prompts" ON ai_prompts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

CREATE POLICY "All authenticated users can view active prompts" ON ai_prompts
  FOR SELECT USING (is_active = true AND auth.uid() IS NOT NULL);

-- Device actions policies
CREATE POLICY "Users can view device actions in their organization" ON device_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN user_roles ur ON ur.customer_id = cs.customer_id
      WHERE cs.id = device_actions.session_id
      AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can approve/reject actions" ON device_actions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN user_roles ur ON ur.customer_id = cs.customer_id
      WHERE cs.id = device_actions.session_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'admin')
    )
  );
```

## Migrations

### Migration Files Required

1. **001_user_roles_table.sql** - Creates user_roles table with indexes and RLS policies
2. **002_chat_system_tables.sql** - Creates chat_sessions and chat_messages tables
3. **003_ai_prompts_table.sql** - Creates ai_prompts table for prompt template management
4. **004_device_actions_table.sql** - Creates device_actions table for command tracking
5. **005_existing_table_modifications.sql** - Adds JSONB columns to customers and devices tables

### Migration Order Dependencies

- user_roles must be created before other tables due to policy references
- chat_sessions must exist before chat_messages and device_actions
- All auth.users and existing customers/devices tables must exist first

## Rationale

- **user_roles table**: Implements the three-tier permission system (owner, admin, viewer) with proper organization isolation
- **chat_sessions and chat_messages**: Stores conversation history with AI, enabling session management and history retrieval
- **ai_prompts table**: Allows owner users to configure and manage Claude Code SDK prompt templates
- **device_actions table**: Tracks all device agent commands and outputs with approval workflow support
- **RLS policies**: Ensures proper data isolation between organizations and role-based access control
- **Indexes**: Optimizes query performance for common access patterns (user lookups, message history, device actions)
- **JSONB columns**: Provides flexibility for metadata, settings, and configuration without schema changes
