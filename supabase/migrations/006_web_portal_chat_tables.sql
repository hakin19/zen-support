-- Migration: Web Portal Chat Tables
-- Description: Add chat sessions and messages tables for web portal AI interactions
-- Author: Aizen vNE
-- Date: 2025-01-04

-- Create chat session status enum
CREATE TYPE chat_session_status AS ENUM ('active', 'archived', 'closed');

-- Create message role enum
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'error');

-- Create chat_sessions table
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255),
    status chat_session_status NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    
    -- Foreign key constraints
    CONSTRAINT fk_chat_sessions_customer FOREIGN KEY (customer_id)
        REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id)
        REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create chat_messages table
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Foreign key constraint with cascade delete
    CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id)
        REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_chat_sessions_customer_id ON chat_sessions(customer_id);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX idx_chat_messages_role ON chat_messages(role);

-- Add trigger to auto-update updated_at for chat_sessions
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to auto-generate session title from first message
CREATE OR REPLACE FUNCTION auto_generate_session_title()
RETURNS TRIGGER AS $$
DECLARE
    session_title VARCHAR(255);
BEGIN
    -- Only generate title if session doesn't have one and this is a user message
    IF NEW.role = 'user' THEN
        SELECT title INTO session_title
        FROM chat_sessions
        WHERE id = NEW.session_id;
        
        IF session_title IS NULL OR session_title = '' THEN
            -- Generate title from first 100 chars of message
            UPDATE chat_sessions
            SET title = LEFT(NEW.content, 100) || 
                       CASE WHEN LENGTH(NEW.content) > 100 THEN '...' ELSE '' END,
                updated_at = NOW()
            WHERE id = NEW.session_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate session title
CREATE TRIGGER auto_generate_title_on_first_message
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_session_title();

-- Create function to close inactive sessions
CREATE OR REPLACE FUNCTION close_inactive_sessions()
RETURNS void AS $$
BEGIN
    UPDATE chat_sessions
    SET status = 'closed',
        closed_at = NOW(),
        updated_at = NOW()
    WHERE status = 'active'
        AND updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Create function to archive old sessions
CREATE OR REPLACE FUNCTION archive_old_sessions()
RETURNS void AS $$
BEGIN
    UPDATE chat_sessions
    SET status = 'archived',
        updated_at = NOW()
    WHERE status = 'closed'
        AND closed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE chat_sessions IS 'Stores chat sessions between users and the AI assistant';
COMMENT ON COLUMN chat_sessions.id IS 'Unique identifier for the chat session';
COMMENT ON COLUMN chat_sessions.customer_id IS 'Reference to the customer this session belongs to';
COMMENT ON COLUMN chat_sessions.user_id IS 'User who initiated this chat session';
COMMENT ON COLUMN chat_sessions.title IS 'Session title (auto-generated from first message if not provided)';
COMMENT ON COLUMN chat_sessions.status IS 'Current status of the session (active, archived, closed)';
COMMENT ON COLUMN chat_sessions.metadata IS 'Additional session data (device_id, context, etc.)';

COMMENT ON TABLE chat_messages IS 'Stores individual messages within a chat session';
COMMENT ON COLUMN chat_messages.id IS 'Unique identifier for the message';
COMMENT ON COLUMN chat_messages.session_id IS 'Reference to the parent chat session';
COMMENT ON COLUMN chat_messages.role IS 'Role of the message sender (user, assistant, system, error)';
COMMENT ON COLUMN chat_messages.content IS 'The actual message content';
COMMENT ON COLUMN chat_messages.metadata IS 'Additional message data (tokens used, model, etc.)';