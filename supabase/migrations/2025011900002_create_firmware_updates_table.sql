-- Create firmware_updates table for device firmware management
CREATE TABLE IF NOT EXISTS public.firmware_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  download_url TEXT,
  release_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ,
  CONSTRAINT firmware_updates_status_check CHECK (status IN ('pending', 'available', 'downloading', 'installing', 'installed', 'failed'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_firmware_updates_device_id ON public.firmware_updates(device_id);
CREATE INDEX IF NOT EXISTS idx_firmware_updates_status ON public.firmware_updates(status);
CREATE INDEX IF NOT EXISTS idx_firmware_updates_created_at ON public.firmware_updates(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firmware_updates TO authenticated;
GRANT SELECT ON public.firmware_updates TO anon;

-- Add RLS policies
ALTER TABLE public.firmware_updates ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to see firmware updates for their customer's devices
CREATE POLICY "Users can view firmware updates for their customer's devices"
  ON public.firmware_updates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      INNER JOIN public.user_roles ur ON d.customer_id = ur.customer_id
      WHERE d.id = firmware_updates.device_id
      AND ur.user_id = auth.uid()
    )
  );

-- Policy to allow admins and owners to manage firmware updates
CREATE POLICY "Admins and owners can manage firmware updates"
  ON public.firmware_updates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      INNER JOIN public.user_roles ur ON d.customer_id = ur.customer_id
      WHERE d.id = firmware_updates.device_id
      AND ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'owner')
    )
  );