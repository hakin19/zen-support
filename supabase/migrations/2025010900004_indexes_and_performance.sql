-- Database Indexes for Performance Optimization

-- =====================
-- CUSTOMERS TABLE INDEXES
-- =====================
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_is_active ON customers(is_active) WHERE is_active = true;
CREATE INDEX idx_customers_created_at ON customers(created_at DESC);

-- =====================
-- USERS TABLE INDEXES
-- =====================
CREATE INDEX idx_users_customer_id ON users(customer_id);
CREATE INDEX idx_users_email ON users(id, customer_id); -- Composite for auth lookups
CREATE INDEX idx_users_role ON users(role) WHERE is_active = true;
CREATE INDEX idx_users_customer_role ON users(customer_id, role) WHERE is_active = true;
CREATE INDEX idx_users_last_login ON users(last_login_at DESC NULLS LAST);

-- =====================
-- DEVICES TABLE INDEXES
-- =====================
CREATE INDEX idx_devices_customer_id ON devices(customer_id);
CREATE INDEX idx_devices_device_id ON devices(device_id); -- Hardware ID lookups
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_customer_status ON devices(customer_id, status);
CREATE INDEX idx_devices_last_heartbeat ON devices(last_heartbeat_at DESC NULLS LAST);

-- =====================
-- DIAGNOSTIC SESSIONS INDEXES
-- =====================
CREATE INDEX idx_diagnostic_sessions_customer_id ON diagnostic_sessions(customer_id);
CREATE INDEX idx_diagnostic_sessions_device_id ON diagnostic_sessions(device_id);
CREATE INDEX idx_diagnostic_sessions_user_id ON diagnostic_sessions(user_id);
CREATE INDEX idx_diagnostic_sessions_status ON diagnostic_sessions(status);
CREATE INDEX idx_diagnostic_sessions_customer_status ON diagnostic_sessions(customer_id, status);
CREATE INDEX idx_diagnostic_sessions_created_at ON diagnostic_sessions(created_at DESC);
CREATE INDEX idx_diagnostic_sessions_mttr ON diagnostic_sessions(mttr_minutes) WHERE mttr_minutes IS NOT NULL;

-- Composite index for common query pattern
CREATE INDEX idx_diagnostic_sessions_customer_device_status 
    ON diagnostic_sessions(customer_id, device_id, status);

-- =====================
-- REMEDIATION ACTIONS INDEXES
-- =====================
CREATE INDEX idx_remediation_actions_session_id ON remediation_actions(session_id);
CREATE INDEX idx_remediation_actions_status ON remediation_actions(status);
CREATE INDEX idx_remediation_actions_risk_level ON remediation_actions(risk_level);
CREATE INDEX idx_remediation_actions_approved_by ON remediation_actions(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX idx_remediation_actions_created_at ON remediation_actions(created_at DESC);

-- Composite index for approval workflows
CREATE INDEX idx_remediation_actions_status_risk 
    ON remediation_actions(status, risk_level) 
    WHERE status = 'pending';

-- =====================
-- AUDIT LOGS INDEXES
-- =====================
CREATE INDEX idx_audit_logs_customer_id ON audit_logs(customer_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite index for audit trail queries
CREATE INDEX idx_audit_logs_customer_created 
    ON audit_logs(customer_id, created_at DESC);

-- GIN index for JSONB details searching
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN (details);

-- =====================
-- NETWORK DIAGNOSTICS INDEXES
-- =====================
CREATE INDEX idx_network_diagnostics_device_id ON network_diagnostics(device_id);
CREATE INDEX idx_network_diagnostics_session_id ON network_diagnostics(session_id);
CREATE INDEX idx_network_diagnostics_type ON network_diagnostics(diagnostic_type);
CREATE INDEX idx_network_diagnostics_created_at ON network_diagnostics(created_at DESC);
CREATE INDEX idx_network_diagnostics_anomaly ON network_diagnostics(is_anomaly) WHERE is_anomaly = true;

-- Composite index for device diagnostics history
CREATE INDEX idx_network_diagnostics_device_type_created 
    ON network_diagnostics(device_id, diagnostic_type, created_at DESC);

-- GIN index for JSONB result searching
CREATE INDEX idx_network_diagnostics_result ON network_diagnostics USING GIN (result);

-- =====================
-- ALERTS INDEXES
-- =====================
CREATE INDEX idx_alerts_customer_id ON alerts(customer_id);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_is_resolved ON alerts(is_resolved);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- Composite index for active alerts
CREATE INDEX idx_alerts_customer_unresolved 
    ON alerts(customer_id, severity, created_at DESC) 
    WHERE is_resolved = false;

-- =====================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- =====================

-- Active devices per customer
CREATE INDEX idx_devices_active_per_customer 
    ON devices(customer_id, last_heartbeat_at DESC) 
    WHERE status = 'online';

-- Note: Removed recent sessions index with date calculation as it requires IMMUTABLE functions

-- Pending remediations
CREATE INDEX idx_pending_remediations 
    ON remediation_actions(created_at DESC) 
    WHERE status = 'pending';

-- Critical unresolved alerts
CREATE INDEX idx_critical_alerts 
    ON alerts(customer_id, created_at DESC) 
    WHERE severity = 'critical' AND is_resolved = false;

-- =====================
-- PERFORMANCE MONITORING
-- =====================

-- Create extension for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Function to analyze table sizes and suggest maintenance
CREATE OR REPLACE FUNCTION analyze_table_health()
RETURNS TABLE(
    table_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    index_size TEXT,
    toast_size TEXT,
    needs_vacuum BOOLEAN,
    needs_analyze BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.schemaname||'.'||t.tablename AS table_name,
        t.n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename)) AS total_size,
        pg_size_pretty(pg_indexes_size(t.schemaname||'.'||t.tablename)) AS index_size,
        pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename) - 
                      pg_relation_size(t.schemaname||'.'||t.tablename) - 
                      pg_indexes_size(t.schemaname||'.'||t.tablename)) AS toast_size,
        t.n_dead_tup > t.n_live_tup * 0.2 AS needs_vacuum,
        (t.n_mod_since_analyze > t.n_live_tup * 0.1) OR 
        (current_timestamp - t.last_analyze > interval '7 days') AS needs_analyze
    FROM pg_stat_user_tables t
    WHERE t.schemaname = 'public'
    ORDER BY pg_total_relation_size(t.schemaname||'.'||t.tablename) DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION analyze_table_health() TO authenticated;