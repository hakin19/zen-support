-- Add indexes to support pagination by registered_at on devices
-- Ensures efficient queries for:
--   WHERE customer_id = ?
--   ORDER BY registered_at DESC
--   AND registered_at < cursor

-- Composite index for common customer-scoped pagination
CREATE INDEX IF NOT EXISTS idx_devices_customer_registered_at
  ON devices(customer_id, registered_at DESC NULLS LAST);

-- Optional single-column index for global queries ordered by registered_at
CREATE INDEX IF NOT EXISTS idx_devices_registered_at
  ON devices(registered_at DESC NULLS LAST);

