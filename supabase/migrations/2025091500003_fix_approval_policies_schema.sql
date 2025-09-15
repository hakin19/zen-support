-- Fix approval_policies schema to match HITLPermissionHandler expectations
-- This migration safely transforms the schema while preserving existing data

-- Step 1: Add new columns with safe defaults
ALTER TABLE approval_policies
  ADD COLUMN IF NOT EXISTS tool_name TEXT,
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_threshold TEXT DEFAULT 'medium';

-- Step 2: Migrate existing data from old columns to new
UPDATE approval_policies
SET
  tool_name = tool_pattern,  -- Direct mapping
  auto_approve = CASE
    WHEN action = 'allow' THEN true
    ELSE false
  END,
  requires_approval = CASE
    WHEN action = 'deny' THEN false  -- Denied tools don't need approval, they're blocked
    WHEN action = 'ask' THEN true    -- Ask means approval required
    WHEN action = 'allow' THEN false -- Allow means no approval needed
    ELSE true                         -- Default to requiring approval
  END,
  risk_threshold = CASE
    WHEN conditions->>'risk_level' IS NOT NULL THEN conditions->>'risk_level'
    WHEN action = 'deny' THEN 'high'
    WHEN action = 'allow' THEN 'low'
    ELSE 'medium'
  END
WHERE tool_name IS NULL;  -- Only update if not already migrated

-- Step 3: Create unique constraint for upsert operations
-- Drop any existing constraint first (safe operation)
ALTER TABLE approval_policies
  DROP CONSTRAINT IF EXISTS approval_policies_customer_tool_unique;

-- Create the constraint the code expects
ALTER TABLE approval_policies
  ADD CONSTRAINT approval_policies_customer_tool_unique
  UNIQUE (customer_id, tool_name);

-- Step 4: Update column constraints
-- Make tool_name required after migration
UPDATE approval_policies SET tool_name = tool_pattern WHERE tool_name IS NULL;
ALTER TABLE approval_policies ALTER COLUMN tool_name SET NOT NULL;

-- Step 5: Add check constraints for new columns
ALTER TABLE approval_policies
  ADD CONSTRAINT approval_policies_risk_check
    CHECK (risk_threshold IN ('low', 'medium', 'high', 'critical'));

-- Step 6: Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_approval_policies_tool_name
  ON approval_policies(tool_name);
CREATE INDEX IF NOT EXISTS idx_approval_policies_auto_approve
  ON approval_policies(auto_approve) WHERE auto_approve = true;
CREATE INDEX IF NOT EXISTS idx_approval_policies_requires_approval
  ON approval_policies(requires_approval) WHERE requires_approval = true;

-- Step 7: Add comments for documentation
COMMENT ON COLUMN approval_policies.tool_name IS 'Exact tool name for matching (replaces tool_pattern)';
COMMENT ON COLUMN approval_policies.auto_approve IS 'Whether this tool is automatically approved';
COMMENT ON COLUMN approval_policies.requires_approval IS 'Whether this tool requires human approval';
COMMENT ON COLUMN approval_policies.risk_threshold IS 'Risk level threshold for this tool';

-- Note: We keep the old columns for backward compatibility during transition
-- They can be dropped in a future migration after confirming all code is updated
COMMENT ON COLUMN approval_policies.tool_pattern IS 'DEPRECATED: Use tool_name instead';
COMMENT ON COLUMN approval_policies.action IS 'DEPRECATED: Use auto_approve/requires_approval instead';