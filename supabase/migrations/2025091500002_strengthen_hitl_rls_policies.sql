-- Strengthen RLS policies for HITL tables to explicitly deny writes from non-service roles
-- This ensures only the API service role can write to these critical tables

-- Drop existing policies for approval_requests to rebuild them more explicitly
DROP POLICY IF EXISTS "Customers can view their own approval requests" ON approval_requests;
DROP POLICY IF EXISTS "Service role can manage all approval requests" ON approval_requests;

-- Recreate policies for approval_requests with explicit deny for non-service writes
-- Policy: Customers can ONLY view their own approval requests (no write access)
CREATE POLICY "Customers can view their own approval requests"
  ON approval_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_requests.customer_id
    )
  );

-- Policy: Only service role can perform ANY write operations
CREATE POLICY "Service role can manage all approval requests"
  ON approval_requests FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add explicit DENY policy for INSERT from non-service roles
CREATE POLICY "Deny non-service writes to approval requests"
  ON approval_requests FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Deny non-service updates to approval requests"
  ON approval_requests FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Deny non-service deletes from approval requests"
  ON approval_requests FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Drop and recreate policies for ai_messages to be more explicit
DROP POLICY IF EXISTS "Service role can manage all AI messages" ON ai_messages;

-- Policy: Only service role can access AI messages at all
CREATE POLICY "Service role can read AI messages"
  ON ai_messages FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can insert AI messages"
  ON ai_messages FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can update AI messages"
  ON ai_messages FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can delete AI messages"
  ON ai_messages FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Strengthen approval_policies to be more restrictive
-- Keep the admin write access but make it more explicit
DROP POLICY IF EXISTS "Admins can manage their customer's policies" ON approval_policies;

-- Replace with more granular policies
CREATE POLICY "Admins can insert their customer's policies"
  ON approval_policies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
      AND user_roles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update their customer's policies"
  ON approval_policies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
      AND user_roles.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
      AND user_roles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete their customer's policies"
  ON approval_policies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.customer_id = approval_policies.customer_id
      AND user_roles.role IN ('admin', 'owner')
    )
  );

-- Add comment explaining the security model
COMMENT ON TABLE approval_requests IS 'HITL approval requests - Write access restricted to service role only. Customer users can only view their own requests.';
COMMENT ON TABLE ai_messages IS 'AI SDK messages - All access restricted to service role only. No direct user access.';
COMMENT ON TABLE approval_policies IS 'Customer approval policies - Admin/Owner users can manage policies for their customer. Service role has full access.';