
-- PART 1: Add country_admin to user_role enum (must be committed alone before use)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'country_admin';

-- PART 2: Add country column to profiles and user_invites
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.user_invites ADD COLUMN IF NOT EXISTS country text;

-- PART 3: Create helper function to get user's country
CREATE OR REPLACE FUNCTION public.get_user_country()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_country text;
BEGIN
  SELECT p.country INTO v_country
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  RETURN v_country;
END;
$$;
