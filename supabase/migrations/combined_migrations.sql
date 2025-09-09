-- Combined migrations for initial setup
-- Run this in Supabase SQL Editor if tables don't exist

-- Check and create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Only create types if they don't exist
DO $$ BEGIN
    CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'maintenance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE diagnostic_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE remediation_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'authenticate', 'approve', 'reject');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create customers table if it doesn't exist
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    PRIMARY KEY (user_id, customer_id)
);

-- Create or replace the handle_new_user function to auto-assign owner role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_customer_id UUID;
    user_count INTEGER;
    assigned_role user_role;
BEGIN
    -- Get or create default customer
    SELECT id INTO default_customer_id
    FROM customers
    WHERE name = 'Default Customer'
    LIMIT 1;

    IF default_customer_id IS NULL THEN
        INSERT INTO customers (
            name,
            contact_email,
            email
        )
        VALUES (
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            NEW.email,
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Create update trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies for users table
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Create basic RLS policies for user_roles
CREATE POLICY "Users can view their own roles" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Success message
SELECT 'Migrations applied successfully! The first user to sign up will automatically become the owner.' as message;