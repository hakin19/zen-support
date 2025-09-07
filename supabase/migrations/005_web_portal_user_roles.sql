-- Migration: Web Portal User Roles
-- Description: Add user roles table for web portal access control
-- Author: Aizen vNE
-- Date: 2025-01-04

-- Create user role enum
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'viewer');

-- Create user_roles table
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    
    -- Composite primary key
    PRIMARY KEY (user_id, customer_id),
    
    -- Ensure user and customer exist
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_customer FOREIGN KEY (customer_id) 
        REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_created_by FOREIGN KEY (created_by)
        REFERENCES auth.users(id)
);

-- Create indexes for performance
CREATE INDEX idx_user_roles_customer_id ON user_roles(customer_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to ensure at least one owner per customer
CREATE OR REPLACE FUNCTION ensure_customer_has_owner()
RETURNS TRIGGER AS $$
DECLARE
    owner_count INTEGER;
BEGIN
    -- Count remaining owners for the customer
    SELECT COUNT(*) INTO owner_count
    FROM user_roles
    WHERE customer_id = OLD.customer_id 
        AND role = 'owner'
        AND user_id != OLD.user_id;
    
    -- If this is the last owner and we're removing/changing it
    IF owner_count = 0 AND (OLD.role = 'owner' AND (NEW.role != 'owner' OR NEW IS NULL)) THEN
        RAISE EXCEPTION 'Cannot remove the last owner of a customer';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure at least one owner
CREATE TRIGGER ensure_owner_exists
    BEFORE UPDATE OR DELETE ON user_roles
    FOR EACH ROW
    WHEN (OLD.role = 'owner')
    EXECUTE FUNCTION ensure_customer_has_owner();

-- Add comments for documentation
COMMENT ON TABLE user_roles IS 'Manages user access and roles for customers in the web portal';
COMMENT ON COLUMN user_roles.user_id IS 'Reference to the auth.users table';
COMMENT ON COLUMN user_roles.customer_id IS 'Reference to the customers table';
COMMENT ON COLUMN user_roles.role IS 'User role within the customer organization (owner, admin, viewer)';
COMMENT ON COLUMN user_roles.created_at IS 'Timestamp when the role was assigned';
COMMENT ON COLUMN user_roles.updated_at IS 'Timestamp when the role was last updated';
COMMENT ON COLUMN user_roles.created_by IS 'User who assigned this role';