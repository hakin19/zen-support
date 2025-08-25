-- Seed Data for Development and Testing
-- This file contains test data for local development

-- Clear existing test data (be careful in production!)
TRUNCATE TABLE alerts CASCADE;
TRUNCATE TABLE network_diagnostics CASCADE;
TRUNCATE TABLE remediation_actions CASCADE;
TRUNCATE TABLE diagnostic_sessions CASCADE;
TRUNCATE TABLE devices CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE customers CASCADE;

-- Insert test customers
INSERT INTO customers (id, name, email, phone, address, subscription_tier, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corporation', 'admin@acme.com', '+1-555-0100', '123 Business St, San Francisco, CA 94105', 'enterprise', true),
  ('22222222-2222-2222-2222-222222222222', 'TechStart Inc', 'contact@techstart.com', '+1-555-0200', '456 Startup Ave, Austin, TX 78701', 'professional', true),
  ('33333333-3333-3333-3333-333333333333', 'Local Coffee Shop', 'owner@localcoffee.com', '+1-555-0300', '789 Main St, Seattle, WA 98101', 'basic', true);

-- Note: Users must be created via Supabase Auth first
-- The users table references auth.users(id) as a foreign key
-- We'll skip inserting users here and create them properly through auth

-- Insert test devices
INSERT INTO devices (id, customer_id, device_id, name, type, status, location, network_info, last_heartbeat_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'DEV-ACME-001', 'Main Office Router', 'raspberry_pi', 'online', 'Server Room A', 
   '{"ip": "192.168.1.100", "mac": "AA:BB:CC:DD:EE:01", "gateway": "192.168.1.1"}', NOW()),
  
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'DEV-ACME-002', 'Branch Office Router', 'raspberry_pi', 'online', 'Branch Office B',
   '{"ip": "192.168.2.100", "mac": "AA:BB:CC:DD:EE:02", "gateway": "192.168.2.1"}', NOW() - INTERVAL '5 minutes'),
  
  ('d3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'DEV-TECH-001', 'Development Network', 'raspberry_pi', 'offline', 'Dev Lab',
   '{"ip": "10.0.1.50", "mac": "AA:BB:CC:DD:EE:03", "gateway": "10.0.1.1"}', NOW() - INTERVAL '2 hours'),
  
  ('d4444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'DEV-COFFEE-001', 'Guest WiFi Monitor', 'raspberry_pi', 'online', 'Front Desk',
   '{"ip": "172.16.0.10", "mac": "AA:BB:CC:DD:EE:04", "gateway": "172.16.0.1"}', NOW());

-- Insert test diagnostic sessions
INSERT INTO diagnostic_sessions (id, customer_id, device_id, session_type, status, issue_description, diagnostic_data, ai_analysis, mttr_minutes, started_at, completed_at) VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 
   'web', 'completed', 'High latency on main connection',
   '{"ping": {"avg": 150, "max": 500, "min": 50}, "traceroute": {"hops": 15}}',
   '{"issue": "Network congestion detected", "recommendation": "Check bandwidth usage"}',
   25, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '25 minutes'),
  
  ('e2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222',
   'voice', 'in_progress', 'Internet connection dropping intermittently',
   '{"ping": {"packet_loss": 15}, "dns": {"response_time": 2000}}',
   '{}',
   NULL, NOW() - INTERVAL '30 minutes', NULL),
  
  ('e3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'd3333333-3333-3333-3333-333333333333',
   'api', 'failed', 'Device not responding',
   '{}',
   '{"issue": "Device offline", "recommendation": "Physical inspection required"}',
   NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours');

-- Insert test remediation actions
INSERT INTO remediation_actions (id, session_id, action_type, description, script_content, risk_level, status, approved_at, executed_at) VALUES
  ('f1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'restart_service', 'Restart DNS service',
   'sudo systemctl restart systemd-resolved', 'low', 'executed',
   NOW() - INTERVAL '1 day' + INTERVAL '10 minutes', NOW() - INTERVAL '1 day' + INTERVAL '15 minutes'),
  
  ('f2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222', 'update_config', 'Change DNS servers',
   'echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf', 'medium', 'pending', NULL, NULL);

-- Insert test network diagnostics
INSERT INTO network_diagnostics (id, device_id, session_id, diagnostic_type, target, result, is_anomaly) VALUES
  ('91111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111',
   'ping', '8.8.8.8', '{"avg": 150, "max": 500, "min": 50, "packet_loss": 0}', true),
  
  ('92222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111',
   'traceroute', '8.8.8.8', '{"hops": [{"ip": "192.168.1.1", "time": 1}, {"ip": "10.0.0.1", "time": 5}]}', false),
  
  ('93333333-3333-3333-3333-333333333333', 'd2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222',
   'dns', 'google.com', '{"response_time": 2000, "resolved": true, "ip": "142.250.80.46"}', true);

-- Insert test alerts
INSERT INTO alerts (id, customer_id, device_id, alert_type, severity, title, description, is_resolved, resolved_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
   'high_latency', 'warning', 'High Network Latency Detected',
   'Average latency exceeded 100ms threshold', true, NOW() - INTERVAL '1 day' + INTERVAL '30 minutes'),
  
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222',
   'packet_loss', 'error', 'Significant Packet Loss',
   '15% packet loss detected on WAN connection', false, NULL),
  
  ('a3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'd3333333-3333-3333-3333-333333333333',
   'device_offline', 'critical', 'Device Offline',
   'Device has not reported status for 2 hours', false, NULL);

-- Audit logs will be created when users perform actions
-- Skipping for now since we need auth users first