-- Seed data for authentication testing
-- This creates test customers and users for development

-- Insert test customers
INSERT INTO customers (id, name, email, phone, address, subscription_tier, is_active, metadata)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp', 'contact@acmecorp.com', '+14155551234', 
   '123 Market St, San Francisco, CA 94105', 'premium', true, 
   '{"industry": "Technology", "employees": "50-100", "founded": "2020"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'TechStart Inc', 'info@techstart.com', '+14155555678',
   '456 Innovation Way, Palo Alto, CA 94301', 'standard', true,
   '{"industry": "Software", "employees": "10-50", "founded": "2021"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'Global Retail Co', 'support@globalretail.com', '+14155559012',
   '789 Commerce Blvd, San Jose, CA 95110', 'enterprise', true,
   '{"industry": "Retail", "employees": "100-500", "founded": "2015"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Note: Users need to be created through Supabase Auth first
-- Then linked to the users table with their auth_id
-- This is handled by the test-auth.ts script

-- Insert test devices for the customers
INSERT INTO devices (id, customer_id, device_id, name, model, location, status, last_heartbeat, metadata)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 
   'DEV-ACME-001', 'HQ Gateway', 'RaspberryPi-4B', 'San Francisco HQ', 'online',
   NOW(), '{"firmware": "1.0.0", "ip": "10.0.1.100"}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'DEV-TECH-001', 'Main Office Router', 'RaspberryPi-4B', 'Palo Alto Office', 'online',
   NOW(), '{"firmware": "1.0.0", "ip": "10.0.2.100"}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333',
   'DEV-RETAIL-001', 'Store Network Monitor', 'RaspberryPi-4B', 'San Jose Store #1', 'offline',
   NOW() - INTERVAL '1 hour', '{"firmware": "1.0.0", "ip": "10.0.3.100"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample diagnostic sessions
INSERT INTO diagnostic_sessions (id, customer_id, device_id, session_type, status, started_at, metadata)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'connectivity', 'completed',
   NOW() - INTERVAL '1 day', '{"issue": "Intermittent packet loss", "resolved": true}'::jsonb),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'performance', 'in_progress',
   NOW() - INTERVAL '1 hour', '{"issue": "High latency to cloud services"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample alerts
INSERT INTO alerts (id, customer_id, device_id, alert_type, severity, title, description, status, metadata)
VALUES
  ('e1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'device_offline', 'high',
   'Device Offline', 'Store Network Monitor has been offline for 1 hour', 'open',
   '{"last_seen": "2024-01-20T15:00:00Z"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Create a function to help with user creation after auth setup
CREATE OR REPLACE FUNCTION create_test_user(
  p_auth_id UUID,
  p_customer_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role user_role DEFAULT 'viewer',
  p_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  INSERT INTO users (auth_id, customer_id, email, name, role, phone, is_active)
  VALUES (p_auth_id, p_customer_id, p_email, p_name, p_role, p_phone, true)
  RETURNING id INTO v_user_id;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Log seed data completion
DO $$
BEGIN
  RAISE NOTICE 'Test seed data created successfully';
  RAISE NOTICE 'Test customers: Acme Corp, TechStart Inc, Global Retail Co';
  RAISE NOTICE 'Test devices and diagnostic sessions added';
  RAISE NOTICE 'Use create_test_user() function to add users after auth setup';
END $$;