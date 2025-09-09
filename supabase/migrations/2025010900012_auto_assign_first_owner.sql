-- Migration: Auto-assign first user as owner
-- Description: Automatically assigns owner role to the first user in a customer organization
-- Author: Aizen vNE
-- Date: 2025-09-09

-- Create or replace the handle_new_user function to auto-assign owner role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_customer_id UUID;
    user_count INTEGER;
    assigned_role user_role;
BEGIN
    -- Get or create default customer (same as before)
    SELECT id INTO default_customer_id
    FROM customers
    WHERE name = 'Default Customer'
    LIMIT 1;

    IF default_customer_id IS NULL THEN
        INSERT INTO customers (
            name,
            contact_email
        )
        VALUES (
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            NEW.email
        )
        RETURNING id INTO default_customer_id;
    END IF;

    -- Count existing users for this customer
    SELECT COUNT(*) INTO user_count
    FROM users
    WHERE customer_id = default_customer_id;

    -- If this is the first user, make them owner
    IF user_count = 0 THEN
        assigned_role := 'owner'::user_role;
    ELSE
        assigned_role := 'viewer'::user_role;
    END IF;

    -- Create user profile
    INSERT INTO users (
        id,
        customer_id,
        full_name,
        phone,
        role,
        metadata,
        email
    )
    VALUES (
        NEW.id,
        default_customer_id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
        COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
        NEW.email
    );

    -- Create user_roles entry
    INSERT INTO user_roles (
        user_id,
        customer_id,
        role,
        created_by
    )
    VALUES (
        NEW.id,
        default_customer_id,
        assigned_role,
        NEW.id  -- Self-created for initial signup
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and fix existing users without roles
CREATE OR REPLACE FUNCTION fix_existing_users_without_roles()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    has_owner BOOLEAN;
BEGIN
    -- Loop through all customers
    FOR user_record IN 
        SELECT DISTINCT customer_id 
        FROM users
    LOOP
        -- Check if customer has an owner
        SELECT EXISTS(
            SELECT 1 FROM user_roles 
            WHERE customer_id = user_record.customer_id 
            AND role = 'owner'
        ) INTO has_owner;

        -- If no owner exists, assign the first user as owner
        IF NOT has_owner THEN
            INSERT INTO user_roles (user_id, customer_id, role, created_by)
            SELECT 
                u.id,
                u.customer_id,
                'owner'::user_role,
                u.id
            FROM users u
            WHERE u.customer_id = user_record.customer_id
            ORDER BY u.created_at ASC
            LIMIT 1
            ON CONFLICT (user_id, customer_id) DO NOTHING;
        END IF;

        -- Assign viewer role to all other users without roles
        INSERT INTO user_roles (user_id, customer_id, role, created_by)
        SELECT 
            u.id,
            u.customer_id,
            'viewer'::user_role,
            u.id
        FROM users u
        WHERE u.customer_id = user_record.customer_id
        AND NOT EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = u.id 
            AND ur.customer_id = u.customer_id
        )
        ON CONFLICT (user_id, customer_id) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the fix for existing users
SELECT fix_existing_users_without_roles();

-- Add helpful comment
COMMENT ON FUNCTION handle_new_user() IS 'Handles new user signup, automatically assigning owner role to first user per customer';