-- Add 'cancelled' status to remediation_scripts table to support cancellation functionality
-- Fixes mismatch between application code and database schema

-- Drop the existing status constraint
ALTER TABLE remediation_scripts
  DROP CONSTRAINT IF EXISTS remediation_scripts_status_check;

-- Add new status constraint including 'cancelled'
ALTER TABLE remediation_scripts
  ADD CONSTRAINT remediation_scripts_status_check
  CHECK (status IN (
    'pending_validation',
    'validated',
    'approved',
    'rejected',
    'pending_execution',
    'executing',
    'executed',
    'failed',
    'cancelled'  -- Added to support script cancellation
  ));

-- Update comment to document the new status
COMMENT ON COLUMN remediation_scripts.status IS 'Script execution status: pending_validation, validated, approved, rejected, pending_execution, executing, executed, failed, cancelled';