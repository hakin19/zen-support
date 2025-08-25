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

-- Devices, diagnostic sessions, and alerts are already created in 001_test_data.sql
-- This file is for auth-specific setup only

-- Create a function to help with user creation after auth setup
CREATE OR REPLACE FUNCTION create_test_user(
  p_auth_id UUID,
  p_customer_id UUID,
  p_full_name TEXT,
  p_role VARCHAR(50) DEFAULT 'user',
  p_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  INSERT INTO users (id, customer_id, full_name, role, phone, is_active)
  VALUES (p_auth_id, p_customer_id, p_full_name, p_role, p_phone, true)
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