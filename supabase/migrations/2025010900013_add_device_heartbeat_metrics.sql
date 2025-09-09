-- Add metrics and last_seen columns to devices table for heartbeat system
-- Migration: 2025010900013_add_device_heartbeat_metrics.sql
-- Purpose: Support device heartbeat system with health metrics and last seen tracking

-- Add metrics column to store device health data (CPU, memory, uptime)
ALTER TABLE devices 
  ADD COLUMN IF NOT EXISTS metrics JSONB;

-- Add last_seen column to track when device last sent heartbeat
ALTER TABLE devices 
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Create index for last_seen for quick status queries and filtering
CREATE INDEX IF NOT EXISTS idx_devices_last_seen 
  ON devices(last_seen DESC NULLS LAST);

-- Create index for customer-specific last_seen queries
CREATE INDEX IF NOT EXISTS idx_devices_customer_last_seen 
  ON devices(customer_id, last_seen DESC NULLS LAST);

-- Update any existing devices to have a last_seen value based on last_heartbeat_at
-- This ensures consistency for existing records
UPDATE devices 
SET last_seen = COALESCE(last_heartbeat_at, registered_at, NOW())
WHERE last_seen IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN devices.metrics IS 'Device health metrics from heartbeat (CPU percentage, memory percentage, uptime seconds, etc.)';
COMMENT ON COLUMN devices.last_seen IS 'Last time device sent a heartbeat or was seen online';

-- Grant appropriate permissions (following existing RLS policies)
-- The existing RLS policies on the devices table will automatically apply to these new columns