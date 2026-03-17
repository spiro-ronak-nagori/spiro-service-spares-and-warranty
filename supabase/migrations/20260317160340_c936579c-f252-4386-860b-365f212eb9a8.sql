
-- Add optional country column to rbac_policy_overrides
-- NULL means the override applies globally (all countries)
-- A value means it only applies when the workshop is in that country
ALTER TABLE public.rbac_policy_overrides
  ADD COLUMN country text DEFAULT NULL;

-- Update the unique constraint to include country so we can have
-- different overrides per country for the same role+policy_type+permission_key
-- First drop old unique if it exists, then create new one
CREATE UNIQUE INDEX IF NOT EXISTS rbac_policy_overrides_unique_v2
  ON public.rbac_policy_overrides (role_id, policy_type, permission_key, COALESCE(country, '__GLOBAL__'));
