-- Migration: Web Portal Row Level Security Policies
-- Description: Implement RLS policies for web portal tables
-- Author: Aizen vNE
-- Date: 2025-01-04

-- Enable RLS on all web portal tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_actions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper Functions for RLS
-- ============================================================================

-- Function to get user's role for a customer
CREATE OR REPLACE FUNCTION get_user_role(p_customer_id UUID)
RETURNS user_role AS $$
BEGIN
    RETURN (
        SELECT role
        FROM user_roles
        WHERE user_id = auth.uid()
            AND customer_id = p_customer_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has minimum role
CREATE OR REPLACE FUNCTION has_role_or_higher(p_customer_id UUID, p_min_role user_role)
RETURNS BOOLEAN AS $$
DECLARE
    user_role_val user_role;
BEGIN
    user_role_val := get_user_role(p_customer_id);
    
    IF user_role_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Role hierarchy: owner > admin > viewer
    CASE p_min_role
        WHEN 'viewer' THEN
            RETURN user_role_val IN ('viewer', 'admin', 'owner');
        WHEN 'admin' THEN
            RETURN user_role_val IN ('admin', 'owner');
        WHEN 'owner' THEN
            RETURN user_role_val = 'owner';
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- USER_ROLES Table Policies
-- ============================================================================

-- Users can view their own roles and roles within their customer
CREATE POLICY "Users can view their own roles"
    ON user_roles FOR SELECT
    USING (
        user_id = auth.uid() OR
        customer_id IN (
            SELECT customer_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

-- Only owners can insert new roles
CREATE POLICY "Owners can assign roles"
    ON user_roles FOR INSERT
    WITH CHECK (
        has_role_or_higher(customer_id, 'owner'::user_role)
    );

-- Owners and admins can update roles (but not make themselves owner)
CREATE POLICY "Owners and admins can update roles"
    ON user_roles FOR UPDATE
    USING (
        has_role_or_higher(customer_id, 'admin'::user_role)
    )
    WITH CHECK (
        has_role_or_higher(customer_id, 'admin'::user_role) AND
        (
            -- Prevent non-owners from creating owners
            get_user_role(customer_id) = 'owner'::user_role OR
            role != 'owner'::user_role
        )
    );

-- Only owners can delete roles
CREATE POLICY "Owners can delete roles"
    ON user_roles FOR DELETE
    USING (
        has_role_or_higher(customer_id, 'owner'::user_role)
    );

-- ============================================================================
-- CHAT_SESSIONS Table Policies
-- ============================================================================

-- Users can view sessions for their customer
CREATE POLICY "Users can view customer sessions"
    ON chat_sessions FOR SELECT
    USING (
        has_role_or_higher(customer_id, 'viewer'::user_role)
    );

-- All authenticated users with a role can create sessions
CREATE POLICY "Users can create sessions"
    ON chat_sessions FOR INSERT
    WITH CHECK (
        has_role_or_higher(customer_id, 'viewer'::user_role) AND
        user_id = auth.uid()
    );

-- Users can update their own sessions, admins can update any
CREATE POLICY "Users can update sessions"
    ON chat_sessions FOR UPDATE
    USING (
        user_id = auth.uid() OR
        has_role_or_higher(customer_id, 'admin'::user_role)
    )
    WITH CHECK (
        user_id = auth.uid() OR
        has_role_or_higher(customer_id, 'admin'::user_role)
    );

-- Only admins and owners can delete sessions
CREATE POLICY "Admins can delete sessions"
    ON chat_sessions FOR DELETE
    USING (
        has_role_or_higher(customer_id, 'admin'::user_role)
    );

-- ============================================================================
-- CHAT_MESSAGES Table Policies
-- ============================================================================

-- Users can view messages in sessions they have access to
CREATE POLICY "Users can view messages"
    ON chat_messages FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'viewer'::user_role)
        )
    );

-- Users can create messages in accessible sessions
CREATE POLICY "Users can create messages"
    ON chat_messages FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'viewer'::user_role)
        )
    );

-- Messages cannot be updated once created (immutable)
-- No UPDATE policy

-- Only admins can delete messages
CREATE POLICY "Admins can delete messages"
    ON chat_messages FOR DELETE
    USING (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'admin'::user_role)
        )
    );

-- ============================================================================
-- AI_PROMPTS Table Policies
-- ============================================================================

-- All users can view prompts for their customer
CREATE POLICY "Users can view prompts"
    ON ai_prompts FOR SELECT
    USING (
        has_role_or_higher(customer_id, 'viewer'::user_role)
    );

-- Only owners can create prompts
CREATE POLICY "Owners can create prompts"
    ON ai_prompts FOR INSERT
    WITH CHECK (
        has_role_or_higher(customer_id, 'owner'::user_role) AND
        created_by = auth.uid()
    );

-- Only owners can update prompts
CREATE POLICY "Owners can update prompts"
    ON ai_prompts FOR UPDATE
    USING (
        has_role_or_higher(customer_id, 'owner'::user_role)
    )
    WITH CHECK (
        has_role_or_higher(customer_id, 'owner'::user_role)
    );

-- Only owners can delete prompts
CREATE POLICY "Owners can delete prompts"
    ON ai_prompts FOR DELETE
    USING (
        has_role_or_higher(customer_id, 'owner'::user_role)
    );

-- ============================================================================
-- DEVICE_ACTIONS Table Policies
-- ============================================================================

-- Users can view actions for their customer's devices
CREATE POLICY "Users can view device actions"
    ON device_actions FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'viewer'::user_role)
        )
    );

-- All users can request actions
CREATE POLICY "Users can request actions"
    ON device_actions FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'viewer'::user_role)
        ) AND
        requested_by = auth.uid()
    );

-- Admins and owners can approve/reject actions
CREATE POLICY "Admins can update actions"
    ON device_actions FOR UPDATE
    USING (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'admin'::user_role)
        )
    )
    WITH CHECK (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'admin'::user_role)
        )
    );

-- Only owners can delete actions
CREATE POLICY "Owners can delete actions"
    ON device_actions FOR DELETE
    USING (
        session_id IN (
            SELECT id FROM chat_sessions
            WHERE has_role_or_higher(customer_id, 'owner'::user_role)
        )
    );

-- ============================================================================
-- Service Role Bypass
-- ============================================================================

-- Create policies to allow service role full access (for admin operations)
CREATE POLICY "Service role has full access to user_roles"
    ON user_roles FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to chat_sessions"
    ON chat_sessions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to chat_messages"
    ON chat_messages FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to ai_prompts"
    ON ai_prompts FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to device_actions"
    ON device_actions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Add comments for documentation
COMMENT ON FUNCTION get_user_role IS 'Returns the user role for a given customer';
COMMENT ON FUNCTION has_role_or_higher IS 'Checks if user has minimum required role for a customer';