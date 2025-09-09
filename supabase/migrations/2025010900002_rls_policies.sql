-- Row Level Security (RLS) Policies for Multi-tenant Security

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's customer_id
CREATE OR REPLACE FUNCTION get_user_customer_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT customer_id 
        FROM users 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM users 
        WHERE id = auth.uid() 
        AND role = 'admin'
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user has role
CREATE OR REPLACE FUNCTION has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM users 
        WHERE id = auth.uid() 
        AND role = required_role
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- CUSTOMERS TABLE POLICIES
-- =====================

-- Customers can only see their own organization
CREATE POLICY "Users can view own customer" ON customers
    FOR SELECT
    USING (id = get_user_customer_id());

-- Only admins can update customer info
CREATE POLICY "Admins can update customer" ON customers
    FOR UPDATE
    USING (id = get_user_customer_id() AND is_admin())
    WITH CHECK (id = get_user_customer_id());

-- Service role can manage all customers (for backend operations)
CREATE POLICY "Service role has full access to customers" ON customers
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- USERS TABLE POLICIES
-- =====================

-- Users can see other users in their organization
CREATE POLICY "Users can view users in same customer" ON users
    FOR SELECT
    USING (customer_id = get_user_customer_id());

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND customer_id = get_user_customer_id());

-- Admins can manage users in their organization
CREATE POLICY "Admins can manage users" ON users
    FOR ALL
    USING (customer_id = get_user_customer_id() AND is_admin())
    WITH CHECK (customer_id = get_user_customer_id());

-- Service role has full access
CREATE POLICY "Service role has full access to users" ON users
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- DEVICES TABLE POLICIES
-- =====================

-- Users can view devices in their organization
CREATE POLICY "Users can view own customer devices" ON devices
    FOR SELECT
    USING (customer_id = get_user_customer_id());

-- Admins can manage devices
CREATE POLICY "Admins can manage devices" ON devices
    FOR ALL
    USING (customer_id = get_user_customer_id() AND is_admin())
    WITH CHECK (customer_id = get_user_customer_id());

-- Service role for device registration and updates
CREATE POLICY "Service role has full access to devices" ON devices
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- DIAGNOSTIC SESSIONS POLICIES
-- =====================

-- Users can view diagnostic sessions for their organization
CREATE POLICY "Users can view own customer sessions" ON diagnostic_sessions
    FOR SELECT
    USING (customer_id = get_user_customer_id());

-- Users can create diagnostic sessions
CREATE POLICY "Users can create sessions" ON diagnostic_sessions
    FOR INSERT
    WITH CHECK (customer_id = get_user_customer_id());

-- Users can update sessions they created
CREATE POLICY "Users can update own sessions" ON diagnostic_sessions
    FOR UPDATE
    USING (customer_id = get_user_customer_id() AND user_id = auth.uid())
    WITH CHECK (customer_id = get_user_customer_id());

-- Admins can manage all sessions in their organization
CREATE POLICY "Admins can manage sessions" ON diagnostic_sessions
    FOR ALL
    USING (customer_id = get_user_customer_id() AND is_admin())
    WITH CHECK (customer_id = get_user_customer_id());

-- Service role has full access
CREATE POLICY "Service role has full access to sessions" ON diagnostic_sessions
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- REMEDIATION ACTIONS POLICIES
-- =====================

-- Users can view remediation actions for their sessions
CREATE POLICY "Users can view remediation actions" ON remediation_actions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM diagnostic_sessions 
            WHERE id = remediation_actions.session_id 
            AND customer_id = get_user_customer_id()
        )
    );

-- Only admins can approve/reject remediation actions
CREATE POLICY "Admins can manage remediation actions" ON remediation_actions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM diagnostic_sessions 
            WHERE id = remediation_actions.session_id 
            AND customer_id = get_user_customer_id()
        ) AND is_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM diagnostic_sessions 
            WHERE id = remediation_actions.session_id 
            AND customer_id = get_user_customer_id()
        )
    );

-- Service role has full access
CREATE POLICY "Service role has full access to remediation" ON remediation_actions
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- AUDIT LOGS POLICIES
-- =====================

-- Users can view audit logs for their organization
CREATE POLICY "Users can view own customer audit logs" ON audit_logs
    FOR SELECT
    USING (customer_id = get_user_customer_id());

-- Only service role can insert audit logs (backend only)
CREATE POLICY "Service role can manage audit logs" ON audit_logs
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- NETWORK DIAGNOSTICS POLICIES
-- =====================

-- Users can view network diagnostics for their devices
CREATE POLICY "Users can view network diagnostics" ON network_diagnostics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM devices 
            WHERE id = network_diagnostics.device_id 
            AND customer_id = get_user_customer_id()
        )
    );

-- Service role can manage network diagnostics
CREATE POLICY "Service role has full access to network diagnostics" ON network_diagnostics
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- ALERTS POLICIES
-- =====================

-- Users can view alerts for their organization
CREATE POLICY "Users can view own customer alerts" ON alerts
    FOR SELECT
    USING (customer_id = get_user_customer_id());

-- Users can update alert resolution status
CREATE POLICY "Users can update alerts" ON alerts
    FOR UPDATE
    USING (customer_id = get_user_customer_id())
    WITH CHECK (customer_id = get_user_customer_id());

-- Admins can manage all alerts
CREATE POLICY "Admins can manage alerts" ON alerts
    FOR ALL
    USING (customer_id = get_user_customer_id() AND is_admin())
    WITH CHECK (customer_id = get_user_customer_id());

-- Service role has full access
CREATE POLICY "Service role has full access to alerts" ON alerts
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================
-- GRANT PERMISSIONS
-- =====================

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant appropriate permissions to authenticated users
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE ON customers, users, devices, diagnostic_sessions, remediation_actions, alerts TO authenticated;

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_customer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION has_role(TEXT) TO authenticated;