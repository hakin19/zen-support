-- Migration: Add message_id to device_actions
-- Description: Associate device actions with specific chat messages to prevent duplication in UI
-- Author: Aizen vNE
-- Date: 2025-09-08

-- Add message_id column to device_actions table
ALTER TABLE device_actions 
ADD COLUMN message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE;

-- Create index for better query performance when filtering by message_id
CREATE INDEX idx_device_actions_message_id ON device_actions(message_id);

-- Create composite index for common query pattern (session_id, message_id)
CREATE INDEX idx_device_actions_session_message ON device_actions(session_id, message_id);

-- Add comment to document the column purpose
COMMENT ON COLUMN device_actions.message_id IS 'References the chat message that triggered this device action. Used to associate actions with specific messages in the UI.';

-- Update existing NULL values (optional - remove if you want to keep them NULL)
-- This would associate orphaned actions with a system message or leave them NULL
-- UPDATE device_actions SET message_id = NULL WHERE message_id IS NULL;