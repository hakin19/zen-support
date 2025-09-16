-- Fix schema mismatch between script-execution.service.ts and remediation_scripts table
-- Adds missing columns and updates status CHECK constraint to match code requirements

-- Add missing columns to remediation_scripts table
ALTER TABLE remediation_scripts
  ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS approval_id TEXT,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_result JSONB;

-- Drop the existing status constraint to replace it
ALTER TABLE remediation_scripts
  DROP CONSTRAINT IF EXISTS remediation_scripts_status_check;

-- Add new status constraint with missing statuses
ALTER TABLE remediation_scripts
  ADD CONSTRAINT remediation_scripts_status_check
  CHECK (status IN (
    'pending_validation',
    'validated',
    'approved',
    'rejected',
    'pending_execution',  -- Added: Script queued for execution
    'executing',          -- Added: Script currently executing on device
    'executed',
    'failed'
  ));

-- Add index for approval_id for performance
CREATE INDEX IF NOT EXISTS idx_remediation_scripts_approval_id
  ON remediation_scripts(approval_id)
  WHERE approval_id IS NOT NULL;

-- Add index for executed_at for temporal queries
CREATE INDEX IF NOT EXISTS idx_remediation_scripts_executed_at
  ON remediation_scripts(executed_at DESC)
  WHERE executed_at IS NOT NULL;

-- Add index for checksum for integrity checks
CREATE INDEX IF NOT EXISTS idx_remediation_scripts_checksum
  ON remediation_scripts(checksum);

-- Add comment documenting the execution_result structure
COMMENT ON COLUMN remediation_scripts.execution_result IS 'Execution result from device: {exitCode, stdout, stderr, executionTime, completedAt, error}';
COMMENT ON COLUMN remediation_scripts.checksum IS 'SHA-256 checksum of script content for integrity verification';
COMMENT ON COLUMN remediation_scripts.signature IS 'Digital signature for script authentication (optional)';
COMMENT ON COLUMN remediation_scripts.approval_id IS 'Reference to HITL approval if required';
COMMENT ON COLUMN remediation_scripts.executed_at IS 'Timestamp when script execution started on device';