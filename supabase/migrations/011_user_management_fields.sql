-- Add user management fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index for status and invitation lookups
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id);

-- Create user status enum type if not exists
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'invited', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update the status column to use the enum
ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
ALTER TABLE users ALTER COLUMN status TYPE user_status USING status::user_status;
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active'::user_status;

-- Add constraints
ALTER TABLE users ADD CONSTRAINT check_invitation_expiry 
    CHECK (invitation_expires_at IS NULL OR invitation_expires_at > invitation_sent_at);

-- Create a view for user management that combines users and user_roles
CREATE OR REPLACE VIEW user_management AS
SELECT 
    u.id,
    u.customer_id,
    u.full_name,
    u.email,
    u.phone,
    u.status,
    u.is_active,
    u.last_login_at,
    u.invitation_token,
    u.invitation_sent_at,
    u.invitation_expires_at,
    u.invited_by,
    u.created_at,
    u.updated_at,
    ur.role,
    c.name as customer_name,
    auth_users.email as auth_email
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id AND u.customer_id = ur.customer_id
LEFT JOIN customers c ON u.customer_id = c.id
LEFT JOIN auth.users auth_users ON u.id = auth_users.id;

-- Grant appropriate permissions
GRANT SELECT ON user_management TO authenticated;
GRANT ALL ON users TO authenticated;
GRANT ALL ON user_roles TO authenticated;