-- Add missing RLS policies for user_roles table to allow trigger to work

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role can manage user_roles" ON user_roles;

-- Create policy to allow service role full access
CREATE POLICY "Service role can manage user_roles" ON user_roles
    USING (true)
    WITH CHECK (true);

-- The handle_new_user function runs with SECURITY DEFINER, 
-- so it executes with the privileges of the function owner (postgres/service role)
-- This should allow it to insert into user_roles

-- Also ensure trigger function has proper permissions
ALTER FUNCTION handle_new_user() SECURITY DEFINER SET search_path = public, auth;

-- Grant necessary permissions to authenticated users for reading their own data
GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT ON customers TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;

