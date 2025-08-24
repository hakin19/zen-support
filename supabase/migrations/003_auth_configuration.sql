-- Supabase Authentication Configuration for Email OTP

-- Configure auth settings (these are applied via Supabase dashboard or API)
-- This migration documents the required settings and creates supporting functions

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_customer_id UUID;
BEGIN
    -- Check if user has a customer_id in metadata (for invited users)
    IF NEW.raw_user_meta_data->>'customer_id' IS NOT NULL THEN
        default_customer_id := (NEW.raw_user_meta_data->>'customer_id')::UUID;
    ELSE
        -- For self-signup, create a new customer (if allowed)
        -- This can be disabled in production if only invited users are allowed
        INSERT INTO customers (name, email)
        VALUES (
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            NEW.email
        )
        RETURNING id INTO default_customer_id;
    END IF;

    -- Create user profile
    INSERT INTO users (
        id,
        customer_id,
        full_name,
        phone,
        role,
        metadata
    )
    VALUES (
        NEW.id,
        default_customer_id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
        COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Function to handle user deletion (cascade)
CREATE OR REPLACE FUNCTION handle_user_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- User deletion is handled by CASCADE in foreign keys
    -- This function can be used for additional cleanup if needed
    
    -- Log the deletion in audit_logs
    INSERT INTO audit_logs (
        customer_id,
        user_id,
        action,
        resource_type,
        resource_id,
        details
    )
    SELECT 
        u.customer_id,
        OLD.id,
        'delete',
        'user',
        OLD.id,
        jsonb_build_object(
            'email', OLD.email,
            'deleted_at', NOW()
        )
    FROM users u
    WHERE u.id = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user deletion
CREATE OR REPLACE TRIGGER on_auth_user_deleted
    BEFORE DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_delete();

-- Function to validate phone number for SMS OTP (if we enable it later)
CREATE OR REPLACE FUNCTION validate_phone_number(phone_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Basic phone validation (can be enhanced)
    -- Accepts formats: +1234567890, 1234567890, (123) 456-7890
    RETURN phone_number ~ '^\+?[1-9]\d{1,14}$' 
        OR phone_number ~ '^\(\d{3}\)\s?\d{3}-?\d{4}$'
        OR phone_number ~ '^\d{10}$';
END;
$$ LANGUAGE plpgsql;

-- Function to invite a user to a customer organization
CREATE OR REPLACE FUNCTION invite_user_to_customer(
    inviter_user_id UUID,
    invited_email TEXT,
    customer_id UUID,
    user_role TEXT DEFAULT 'user'
)
RETURNS JSONB AS $$
DECLARE
    inviter_customer_id UUID;
    result JSONB;
BEGIN
    -- Verify inviter has permission (must be admin of the customer)
    SELECT u.customer_id INTO inviter_customer_id
    FROM users u
    WHERE u.id = inviter_user_id
        AND u.customer_id = invite_user_to_customer.customer_id
        AND u.role = 'admin'
        AND u.is_active = true;
    
    IF inviter_customer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: You must be an admin of this organization'
        );
    END IF;
    
    -- Check if user already exists
    IF EXISTS (
        SELECT 1 FROM auth.users au
        JOIN users u ON u.id = au.id
        WHERE au.email = invited_email
        AND u.customer_id = invite_user_to_customer.customer_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User already exists in this organization'
        );
    END IF;
    
    -- Log the invitation
    INSERT INTO audit_logs (
        customer_id,
        user_id,
        action,
        resource_type,
        details
    )
    VALUES (
        customer_id,
        inviter_user_id,
        'create',
        'invitation',
        jsonb_build_object(
            'invited_email', invited_email,
            'role', user_role,
            'invited_at', NOW()
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invitation logged. User will be added to organization upon signup.',
        'customer_id', customer_id,
        'role', user_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_phone_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION invite_user_to_customer(UUID, TEXT, UUID, TEXT) TO authenticated;

-- Note: The following settings should be configured in Supabase Dashboard:
-- 1. Enable Email OTP authentication
-- 2. Set OTP expiry to 3600 seconds (1 hour)
-- 3. Configure email templates for OTP
-- 4. Set site URL to match your application URL
-- 5. Configure redirect URLs for authentication flows