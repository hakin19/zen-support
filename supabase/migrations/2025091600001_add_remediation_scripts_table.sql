-- Add remediation_scripts table to support script generation and validation
-- This table stores generated remediation scripts with their manifests and validation status

CREATE TABLE IF NOT EXISTS remediation_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  script TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending_validation' CHECK (status IN ('pending_validation', 'validated', 'approved', 'rejected', 'executed', 'failed')),
  validation_results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_remediation_scripts_session_id ON remediation_scripts(session_id);
CREATE INDEX idx_remediation_scripts_device_id ON remediation_scripts(device_id);
CREATE INDEX idx_remediation_scripts_status ON remediation_scripts(status);
CREATE INDEX idx_remediation_scripts_created_at ON remediation_scripts(created_at DESC);

-- Add RLS policies
ALTER TABLE remediation_scripts ENABLE ROW LEVEL SECURITY;

-- Policy for reading scripts (admins and owners only)
CREATE POLICY remediation_scripts_read_policy
  ON remediation_scripts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('owner', 'admin')
      AND user_roles.customer_id IN (
        SELECT customer_id FROM devices WHERE devices.id = remediation_scripts.device_id
      )
    )
  );

-- Policy for creating scripts (admins and owners only)
CREATE POLICY remediation_scripts_create_policy
  ON remediation_scripts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('owner', 'admin')
      AND user_roles.customer_id IN (
        SELECT customer_id FROM devices WHERE devices.id = remediation_scripts.device_id
      )
    )
  );

-- Policy for updating scripts (admins and owners only)
CREATE POLICY remediation_scripts_update_policy
  ON remediation_scripts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('owner', 'admin')
      AND user_roles.customer_id IN (
        SELECT customer_id FROM devices WHERE devices.id = remediation_scripts.device_id
      )
    )
  );

-- Create script_validations table to track validation history
CREATE TABLE IF NOT EXISTS script_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  script_hash TEXT NOT NULL,
  validation_results JSONB NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for script_validations
CREATE INDEX idx_script_validations_session_id ON script_validations(session_id);
CREATE INDEX idx_script_validations_created_at ON script_validations(created_at DESC);

-- Add RLS policies for script_validations
ALTER TABLE script_validations ENABLE ROW LEVEL SECURITY;

-- Policy for reading validations (admins and owners only)
CREATE POLICY script_validations_read_policy
  ON script_validations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('owner', 'admin')
    )
  );

-- Policy for creating validations (admins and owners only)
CREATE POLICY script_validations_create_policy
  ON script_validations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('owner', 'admin')
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_remediation_scripts_updated_at BEFORE UPDATE ON remediation_scripts
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_updated_at();

-- Add constraint to ensure manifest has required fields
ALTER TABLE remediation_scripts ADD CONSTRAINT valid_manifest
  CHECK (
    manifest ? 'interpreter' AND
    manifest ? 'timeout' AND
    (manifest->>'timeout')::integer > 0 AND
    (manifest->>'timeout')::integer <= 3600
  );

COMMENT ON TABLE remediation_scripts IS 'Stores generated remediation scripts with validation and approval tracking';
COMMENT ON TABLE script_validations IS 'Stores validation results for remediation scripts';
COMMENT ON COLUMN remediation_scripts.manifest IS 'Script execution manifest including interpreter, timeout, and capabilities';