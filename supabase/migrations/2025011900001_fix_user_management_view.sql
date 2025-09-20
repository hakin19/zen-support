-- Drop the old view if it exists
DROP VIEW IF EXISTS public.user_management CASCADE;

-- Create user_management view using existing tables
CREATE OR REPLACE VIEW public.user_management AS
SELECT
  ur.user_id as id,
  ur.customer_id,
  ur.role,
  u.email,
  u.email as auth_email, -- Duplicate for compatibility
  u.raw_user_meta_data->>'full_name' AS full_name,
  u.raw_user_meta_data->>'name' AS display_name,
  u.created_at,
  u.updated_at,
  u.last_sign_in_at,
  u.last_sign_in_at as last_login_at, -- Alias for compatibility
  u.email_confirmed_at,
  CASE
    WHEN u.email_confirmed_at IS NULL THEN 'invited'
    WHEN u.last_sign_in_at IS NULL THEN 'inactive'
    ELSE 'active'
  END AS status,
  -- Add fields expected by the API but with default values
  NULL::varchar AS phone,
  true AS is_active,
  NULL::varchar AS invitation_token,
  NULL::timestamptz AS invitation_sent_at,
  NULL::timestamptz AS invitation_expires_at,
  NULL::uuid AS invited_by,
  c.name as customer_name
FROM public.user_roles ur
INNER JOIN auth.users u ON ur.user_id = u.id
LEFT JOIN public.customers c ON ur.customer_id = c.id
ORDER BY u.created_at DESC;

-- Grant permissions
GRANT SELECT ON public.user_management TO authenticated;
GRANT SELECT ON public.user_management TO anon;