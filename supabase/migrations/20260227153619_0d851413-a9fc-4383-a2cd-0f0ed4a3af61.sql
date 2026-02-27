
-- Add scope columns to user_invites so warranty admin assignments can be created on acceptance
ALTER TABLE public.user_invites
  ADD COLUMN IF NOT EXISTS assignment_country_ids text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assignment_workshop_ids uuid[] DEFAULT NULL;

-- No RLS changes needed - existing policies cover insert/select
