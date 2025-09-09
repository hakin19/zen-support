-- Migration: Web Portal AI Prompts and Device Actions
-- Description: Add tables for AI prompt templates and device action tracking
-- Author: Aizen vNE
-- Date: 2025-01-04

-- Create action type enum
CREATE TYPE action_type AS ENUM ('diagnostic', 'remediation', 'configuration', 'monitoring');

-- Create action status enum
CREATE TYPE action_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'executing',
    'completed',
    'failed',
    'cancelled'
);

-- Create ai_prompts table
CREATE TABLE ai_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    template TEXT NOT NULL,
    category VARCHAR(100),
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    variables JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique name per customer and version
    CONSTRAINT unique_prompt_name_version UNIQUE (customer_id, name, version),
    
    -- Foreign key constraints
    CONSTRAINT fk_ai_prompts_customer FOREIGN KEY (customer_id)
        REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_prompts_created_by FOREIGN KEY (created_by)
        REFERENCES auth.users(id)
);

-- Create device_actions table
CREATE TABLE device_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id),
    action_type action_type NOT NULL,
    command TEXT NOT NULL,
    parameters JSONB DEFAULT '{}',
    status action_status NOT NULL DEFAULT 'pending',
    result TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    rejected_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Foreign key constraints
    CONSTRAINT fk_device_actions_session FOREIGN KEY (session_id)
        REFERENCES chat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_actions_device FOREIGN KEY (device_id)
        REFERENCES devices(id),
    CONSTRAINT fk_device_actions_requested_by FOREIGN KEY (requested_by)
        REFERENCES auth.users(id),
    CONSTRAINT fk_device_actions_approved_by FOREIGN KEY (approved_by)
        REFERENCES auth.users(id),
    CONSTRAINT fk_device_actions_rejected_by FOREIGN KEY (rejected_by)
        REFERENCES auth.users(id),
    
    -- Ensure only one approval/rejection
    CONSTRAINT check_approval_rejection CHECK (
        (approved_by IS NULL OR rejected_by IS NULL)
    ),
    
    -- Ensure timestamps are logical
    CONSTRAINT check_action_timestamps CHECK (
        (approved_at IS NULL OR approved_at >= created_at) AND
        (rejected_at IS NULL OR rejected_at >= created_at) AND
        (executed_at IS NULL OR executed_at >= created_at) AND
        (completed_at IS NULL OR completed_at >= created_at) AND
        (executed_at IS NULL OR approved_at IS NULL OR executed_at >= approved_at)
    )
);

-- Create indexes for performance
CREATE INDEX idx_ai_prompts_customer_id ON ai_prompts(customer_id);
CREATE INDEX idx_ai_prompts_name ON ai_prompts(name);
CREATE INDEX idx_ai_prompts_category ON ai_prompts(category);
CREATE INDEX idx_ai_prompts_is_active ON ai_prompts(is_active);
CREATE INDEX idx_ai_prompts_version ON ai_prompts(version DESC);

CREATE INDEX idx_device_actions_session_id ON device_actions(session_id);
CREATE INDEX idx_device_actions_device_id ON device_actions(device_id);
CREATE INDEX idx_device_actions_status ON device_actions(status);
CREATE INDEX idx_device_actions_action_type ON device_actions(action_type);
CREATE INDEX idx_device_actions_created_at ON device_actions(created_at DESC);
CREATE INDEX idx_device_actions_requested_by ON device_actions(requested_by);

-- Add trigger to auto-update updated_at for ai_prompts
CREATE TRIGGER update_ai_prompts_updated_at
    BEFORE UPDATE ON ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to auto-increment prompt version
CREATE OR REPLACE FUNCTION increment_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    -- Get the maximum version for this prompt name and customer
    SELECT COALESCE(MAX(version), 0) INTO max_version
    FROM ai_prompts
    WHERE customer_id = NEW.customer_id
        AND name = NEW.name;
    
    -- If this is a new version (not an update to existing)
    IF TG_OP = 'INSERT' AND NEW.version = 1 THEN
        NEW.version = max_version + 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-increment version
CREATE TRIGGER auto_increment_prompt_version
    BEFORE INSERT ON ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION increment_prompt_version();

-- Create function to update action status timestamps
CREATE OR REPLACE FUNCTION update_action_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamps based on status changes
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        NEW.approved_at = NOW();
    ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        NEW.rejected_at = NOW();
    ELSIF NEW.status = 'executing' AND OLD.status != 'executing' THEN
        NEW.executed_at = NOW();
    ELSIF (NEW.status = 'completed' OR NEW.status = 'failed') AND 
          (OLD.status != 'completed' AND OLD.status != 'failed') THEN
        NEW.completed_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update action timestamps
CREATE TRIGGER update_device_action_timestamps
    BEFORE UPDATE ON device_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_action_timestamps();

-- Create function to validate action approval
CREATE OR REPLACE FUNCTION validate_action_approval()
RETURNS TRIGGER AS $$
DECLARE
    user_role user_role;
BEGIN
    -- Only validate if status is being changed to approved
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        -- Get the approver's role
        SELECT r.role INTO user_role
        FROM user_roles r
        JOIN chat_sessions s ON s.customer_id = r.customer_id
        WHERE r.user_id = NEW.approved_by
            AND s.id = NEW.session_id;
        
        -- Only owners and admins can approve actions
        IF user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Only owners and admins can approve device actions';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate approvals
CREATE TRIGGER validate_device_action_approval
    BEFORE UPDATE ON device_actions
    FOR EACH ROW
    WHEN (NEW.status = 'approved')
    EXECUTE FUNCTION validate_action_approval();

-- Add comments for documentation
COMMENT ON TABLE ai_prompts IS 'Stores AI prompt templates for customizable system prompts';
COMMENT ON COLUMN ai_prompts.id IS 'Unique identifier for the prompt';
COMMENT ON COLUMN ai_prompts.customer_id IS 'Customer who owns this prompt template';
COMMENT ON COLUMN ai_prompts.name IS 'Name of the prompt template';
COMMENT ON COLUMN ai_prompts.template IS 'The prompt template with variable placeholders';
COMMENT ON COLUMN ai_prompts.category IS 'Category for organizing prompts (diagnostic, remediation, etc.)';
COMMENT ON COLUMN ai_prompts.version IS 'Version number (auto-incremented for same name)';
COMMENT ON COLUMN ai_prompts.is_active IS 'Whether this prompt version is currently active';
COMMENT ON COLUMN ai_prompts.variables IS 'JSON array of variable definitions for the template';
COMMENT ON COLUMN ai_prompts.metadata IS 'Additional prompt configuration and settings';

COMMENT ON TABLE device_actions IS 'Tracks all device actions requested through the AI assistant';
COMMENT ON COLUMN device_actions.id IS 'Unique identifier for the action';
COMMENT ON COLUMN device_actions.session_id IS 'Chat session that initiated this action';
COMMENT ON COLUMN device_actions.device_id IS 'Target device for this action';
COMMENT ON COLUMN device_actions.action_type IS 'Type of action (diagnostic, remediation, etc.)';
COMMENT ON COLUMN device_actions.command IS 'The actual command to execute';
COMMENT ON COLUMN device_actions.parameters IS 'Command parameters and options';
COMMENT ON COLUMN device_actions.status IS 'Current status of the action';
COMMENT ON COLUMN device_actions.result IS 'Output or result from the executed action';
COMMENT ON COLUMN device_actions.error_message IS 'Error message if action failed';
COMMENT ON COLUMN device_actions.metadata IS 'Additional action data and context';