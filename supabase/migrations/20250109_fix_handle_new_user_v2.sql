-- Fix handle_new_user function to properly create customers
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_customer_id UUID;
    user_count INTEGER;
    assigned_role user_role;
BEGIN
    -- Get the first existing customer or create a new one
    SELECT id INTO default_customer_id
    FROM customers
    ORDER BY created_at ASC
    LIMIT 1;

    IF default_customer_id IS NULL THEN
        -- Create a new customer for the first user
        INSERT INTO customers (
            name,
            email
        )
        VALUES (
            COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1) || '''s Organization'),
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
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'phone',
        'user',  -- This is the application role, not the permission role
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
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error for debugging
        RAISE LOG 'Error in handle_new_user: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;