-- Add HITL approval tracking tables
-- These tables support the Human-in-the-Loop approval workflow for AI tool usage

-- Create approval requests table
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'timeout')),
  decision_reason TEXT,
  modified_input JSONB,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create approval policies table
CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tool_pattern TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('allow', 'deny', 'ask')),
  conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI messages table for SDK message tracking
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_approval_requests_session_id ON approval_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_customer_id ON approval_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at ON approval_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_policies_customer_id ON approval_policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_approval_policies_tool_pattern ON approval_policies(tool_pattern);
CREATE INDEX IF NOT EXISTS idx_approval_policies_is_active ON approval_policies(is_active);

CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_at ON ai_messages(created_at DESC);

-- Add RLS policies for approval requests
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own approval requests"
  ON approval_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_requests.customer_id
    )
  );

CREATE POLICY "Service role can manage all approval requests"
  ON approval_requests FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add RLS policies for approval policies
ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own policies"
  ON approval_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
    )
  );

CREATE POLICY "Admins can manage their customer's policies"
  ON approval_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
      AND user_roles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Service role can manage all policies"
  ON approval_policies FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add RLS policies for AI messages
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all AI messages"
  ON ai_messages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create function to cleanup old approval requests
CREATE OR REPLACE FUNCTION cleanup_old_approval_requests()
RETURNS void AS $$
BEGIN
  -- Delete approval requests older than 30 days
  DELETE FROM approval_requests
  WHERE created_at < NOW() - INTERVAL '30 days';

  -- Delete AI messages older than 7 days
  DELETE FROM ai_messages
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Add comment on tables
COMMENT ON TABLE approval_requests IS 'Stores HITL approval requests for AI tool usage';
COMMENT ON TABLE approval_policies IS 'Customer-specific policies for automatic approval/denial of tools';
COMMENT ON TABLE ai_messages IS 'Stores SDK messages for audit and tracking';