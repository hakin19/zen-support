-- Fix the ensure_customer_has_owner trigger function to properly handle DELETE operations
-- This migration fixes a bug where NEW record was referenced during DELETE, causing errors

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS ensure_owner_exists ON user_roles;
DROP FUNCTION IF EXISTS ensure_customer_has_owner();

-- Create the corrected function
CREATE OR REPLACE FUNCTION ensure_customer_has_owner()
RETURNS TRIGGER AS $$
DECLARE
    owner_count INTEGER;
    customer_to_check UUID;
BEGIN
    -- Determine which customer to check
    IF TG_OP = 'DELETE' THEN
        customer_to_check := OLD.customer_id;
    ELSE
        customer_to_check := COALESCE(NEW.customer_id, OLD.customer_id);
    END IF;

    -- Count remaining owners for this customer (excluding current row)
    SELECT COUNT(*) INTO owner_count
    FROM user_roles
    WHERE customer_id = customer_to_check
        AND role = 'owner'
        AND user_id != OLD.user_id;
    
    -- Check if we're removing the last owner
    IF OLD.role = 'owner' THEN
        -- For DELETE operation
        IF TG_OP = 'DELETE' THEN
            IF owner_count = 0 THEN
                RAISE EXCEPTION 'Cannot remove the last owner of a customer';
            END IF;
        -- For UPDATE operation
        ELSIF TG_OP = 'UPDATE' THEN
            -- Check if we're changing away from owner role
            IF NEW.role != 'owner' THEN
                IF owner_count = 0 THEN
                    RAISE EXCEPTION 'Cannot remove the last owner of a customer';
                END IF;
            END IF;
        END IF;
    END IF;
    
    -- Return appropriate value based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER ensure_owner_exists
    BEFORE UPDATE OR DELETE ON user_roles
    FOR EACH ROW
    WHEN (OLD.role = 'owner')
    EXECUTE FUNCTION ensure_customer_has_owner();

-- Add a comment explaining the fix
COMMENT ON FUNCTION ensure_customer_has_owner() IS 
'Ensures that every customer always has at least one owner. 
Fixed in migration 006 to properly handle DELETE operations where NEW is not available.';