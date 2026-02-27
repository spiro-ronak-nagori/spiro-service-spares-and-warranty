
-- Drop the unique CONSTRAINT (not index) on profiles.phone
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_key;

-- Drop the other index
DROP INDEX IF EXISTS public.idx_profiles_phone_lower_unique;

-- Add email column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill: copy email-like values from phone to email
UPDATE public.profiles SET email = phone WHERE phone LIKE '%@%' AND email IS NULL;

-- Make phone nullable
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;

-- Clear phone for rows where it was actually an email
UPDATE public.profiles SET phone = NULL WHERE phone LIKE '%@%';

-- New unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower_unique ON public.profiles (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL;

-- Add phone column to user_invites
ALTER TABLE public.user_invites ADD COLUMN IF NOT EXISTS phone text;

-- Make user_invites.email nullable
ALTER TABLE public.user_invites ALTER COLUMN email DROP NOT NULL;

-- Validation trigger: at least one of email or phone
CREATE OR REPLACE FUNCTION public.validate_user_invite_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NULL AND NEW.phone IS NULL THEN
    RAISE EXCEPTION 'At least one of email or phone is required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_user_invite_identifiers ON public.user_invites;
CREATE TRIGGER trg_validate_user_invite_identifiers
BEFORE INSERT OR UPDATE ON public.user_invites
FOR EACH ROW EXECUTE FUNCTION public.validate_user_invite_identifiers();

-- Recreate pending unique indexes
DROP INDEX IF EXISTS public.idx_user_invites_pending_email;
CREATE UNIQUE INDEX idx_user_invites_pending_email ON public.user_invites (lower(email)) WHERE email IS NOT NULL AND status = 'PENDING';
CREATE UNIQUE INDEX idx_user_invites_pending_phone ON public.user_invites (phone) WHERE phone IS NOT NULL AND status = 'PENDING';

-- Update handle_new_user trigger to set email instead of phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone, workshop_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Test User'),
    NEW.email,
    NEW.phone,
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'technician'
  );
  RETURN NEW;
END;
$$;
