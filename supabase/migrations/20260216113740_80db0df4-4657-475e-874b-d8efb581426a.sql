
-- PART 1: Remove the legacy handle_new_user trigger that auto-creates
-- conflicting profiles with hardcoded "Test User" name and non-existent workshop_id.
-- accept-invite is the single source of truth for profile creation.

-- Drop the trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function (no longer needed)
DROP FUNCTION IF EXISTS public.handle_new_user();
