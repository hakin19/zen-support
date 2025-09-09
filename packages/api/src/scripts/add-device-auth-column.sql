-- Add device_secret_hash column to devices table for authentication
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS device_secret_hash VARCHAR(255);

-- Add index for faster lookups during authentication
CREATE INDEX IF NOT EXISTS idx_devices_secret_hash 
ON devices(device_id, device_secret_hash) 
WHERE device_secret_hash IS NOT NULL;

-- Comment on the column
COMMENT ON COLUMN devices.device_secret_hash IS 'SHA-256 hash of the device secret used for authentication';