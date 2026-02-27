
-- Add a unique index on lower(phone) for constant-time email existence checks.
-- This replaces the need for auth.admin.listUsers() scanning which is paginated
-- and doesn't scale beyond ~500-1000 users.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_lower_unique
ON public.profiles (lower(phone));
