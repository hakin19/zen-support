-- Fix cancellation semantics for script execution
-- Adds proper cancellation states for two-phase cancellation with device acknowledgment

-- Drop existing status constraint to update it
ALTER TABLE remediation_scripts
  DROP CONSTRAINT IF EXISTS remediation_scripts_status_check;

-- Add new status constraint with cancellation states
ALTER TABLE remediation_scripts
  ADD CONSTRAINT remediation_scripts_status_check
  CHECK (status IN (
    'pending_validation',
    'validated',
    'approved',
    'rejected',
    'pending_execution',
    'executing',
    'cancellation_requested',  -- New: User requested cancellation, waiting for device ACK
    'cancelled',               -- New: Cancellation confirmed by device or timeout
    'executed',
    'failed'
  ));

-- Add columns to track cancellation details
ALTER TABLE remediation_scripts
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add indexes for cancellation queries
CREATE INDEX IF NOT EXISTS idx_remediation_scripts_cancellation_requested
  ON remediation_scripts(cancellation_requested_at DESC)
  WHERE cancellation_requested_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remediation_scripts_cancelling
  ON remediation_scripts(status)
  WHERE status IN ('cancellation_requested', 'cancelled');

-- Add comments documenting the cancellation flow
COMMENT ON COLUMN remediation_scripts.cancellation_requested_at IS 'When user requested cancellation';
COMMENT ON COLUMN remediation_scripts.cancellation_confirmed_at IS 'When device confirmed cancellation or timeout occurred';
COMMENT ON COLUMN remediation_scripts.cancellation_reason IS 'Reason for cancellation (user_requested, timeout, device_error, etc)';

-- Update any existing 'cancelled' entries (if they exist despite the constraint)
-- This is a safety measure in case data was inserted incorrectly
UPDATE remediation_scripts
SET status = 'failed',
    execution_result = jsonb_set(
      COALESCE(execution_result, '{}'::jsonb),
      '{error}',
      '"Status was incorrectly set to cancelled - converted to failed"'
    )
WHERE status NOT IN (
  'pending_validation', 'validated', 'approved', 'rejected',
  'pending_execution', 'executing', 'executed', 'failed'
);