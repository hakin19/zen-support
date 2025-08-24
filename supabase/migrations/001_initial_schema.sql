-- Initial schema for Zen & Zen Network Support (Aizen vNE)

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'maintenance');
CREATE TYPE diagnostic_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');
CREATE TYPE remediation_status AS ENUM ('pending', 'approved', 'rejected', 'executed', 'failed');
CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'authenticate', 'approve', 'reject');

-- Customers table (Organizations)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    address TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'basic',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'user', -- admin, user, readonly
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices table (Network devices/agents)
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL UNIQUE, -- Hardware identifier
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'raspberry_pi', -- Device type
    status device_status DEFAULT 'offline',
    location TEXT,
    network_info JSONB DEFAULT '{}', -- IP addresses, MAC, etc.
    configuration JSONB DEFAULT '{}', -- Device-specific config
    last_heartbeat_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diagnostic sessions table
CREATE TABLE diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_type VARCHAR(100) NOT NULL, -- voice, web, api, scheduled
    status diagnostic_status DEFAULT 'pending',
    issue_description TEXT,
    diagnostic_data JSONB DEFAULT '{}', -- Raw diagnostic output
    ai_analysis JSONB DEFAULT '{}', -- Claude analysis results
    resolution_notes TEXT,
    mttr_minutes INTEGER, -- Mean Time To Resolution in minutes
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Remediation actions table
CREATE TABLE remediation_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL, -- restart_service, update_config, etc.
    description TEXT NOT NULL,
    script_content TEXT, -- Actual remediation script
    risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high
    status remediation_status DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    execution_result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    resource_type VARCHAR(100) NOT NULL, -- device, session, remediation, etc.
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Network diagnostics history table (for trending and analysis)
CREATE TABLE network_diagnostics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    session_id UUID REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
    diagnostic_type VARCHAR(100) NOT NULL, -- ping, traceroute, dns, bandwidth, etc.
    target VARCHAR(255), -- Target IP/hostname for the diagnostic
    result JSONB NOT NULL, -- Structured diagnostic result
    is_anomaly BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts and notifications table
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    alert_type VARCHAR(100) NOT NULL, -- device_offline, high_latency, etc.
    severity VARCHAR(20) DEFAULT 'info', -- info, warning, error, critical
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_diagnostic_sessions_updated_at BEFORE UPDATE ON diagnostic_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_remediation_actions_updated_at BEFORE UPDATE ON remediation_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();