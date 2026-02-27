
-- 1. Create user_status enum
CREATE TYPE public.user_status AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- 2. Add status column to profiles  
ALTER TABLE public.profiles ADD COLUMN status public.user_status NOT NULL DEFAULT 'ACTIVE';

-- 3. Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  RETURN v_role;
END;
$$;

-- 4. Create user_invites table
CREATE TABLE public.user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'technician',
  workshop_id UUID REFERENCES public.workshops(id),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT valid_invite_status CHECK (status IN ('PENDING', 'ACCEPTED', 'CANCELLED'))
);

-- Unique constraint: one pending invite per email
CREATE UNIQUE INDEX idx_user_invites_pending_email 
ON public.user_invites(email) 
WHERE status = 'PENDING';

-- Also ensure email uniqueness across active profiles (check auth.users)
-- We'll handle this in edge functions since we can't easily index auth.users

-- Enable RLS
ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for user_invites
CREATE POLICY "Super admins can view all invites"
ON public.user_invites FOR SELECT
USING (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can create invites"
ON public.user_invites FOR INSERT
WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can update invites"
ON public.user_invites FOR UPDATE
USING (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can delete invites"
ON public.user_invites FOR DELETE
USING (get_user_role() = 'super_admin');

CREATE POLICY "Admins can view invites for their workshop"
ON public.user_invites FOR SELECT
USING (
  get_user_role() = 'workshop_admin' 
  AND workshop_id = get_user_workshop_id()
);

CREATE POLICY "Admins can create invites for their workshop"
ON public.user_invites FOR INSERT
WITH CHECK (
  get_user_role() = 'workshop_admin' 
  AND workshop_id = get_user_workshop_id()
);

CREATE POLICY "Admins can update invites for their workshop"
ON public.user_invites FOR UPDATE
USING (
  get_user_role() = 'workshop_admin' 
  AND workshop_id = get_user_workshop_id()
);

-- 6. Protect profile sensitive fields via trigger
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role public.user_role;
  v_workshop_id UUID;
BEGIN
  -- Get role of the authenticated user
  SELECT p.role, p.workshop_id INTO v_role, v_workshop_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Super admins can change anything
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;
  
  -- Workshop admins can change users in their workshop (except their own role)
  IF v_role = 'workshop_admin' AND OLD.workshop_id = v_workshop_id THEN
    IF OLD.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
    RETURN NEW;
  END IF;
  
  -- Regular users: prevent changing protected fields
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify role';
  END IF;
  IF NEW.workshop_id IS DISTINCT FROM OLD.workshop_id THEN
    RAISE EXCEPTION 'Cannot modify workshop assignment';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot modify status';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();

-- 7. Drop auto-signup trigger (invite-only system)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 8. Workshop CRUD policies for super admins
CREATE POLICY "Super admins can create workshops"
ON public.workshops FOR INSERT
WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can update workshops"
ON public.workshops FOR UPDATE
USING (get_user_role() = 'super_admin');

-- 9. Admin and Super Admin profile management
CREATE POLICY "Admins can update profiles in their workshop"
ON public.profiles FOR UPDATE
USING (
  get_user_role() = 'workshop_admin'
  AND workshop_id = get_user_workshop_id()
);

CREATE POLICY "Super admins can update any profile"
ON public.profiles FOR UPDATE
USING (get_user_role() = 'super_admin');

-- 10. Super admins can view all job cards (not just their workshop)
DROP POLICY IF EXISTS "Users can view job cards from their workshop" ON public.job_cards;

CREATE POLICY "Users can view job cards from their workshop or super admin"
ON public.job_cards FOR SELECT
USING (
  is_user_in_workshop(workshop_id) 
  OR get_user_role() = 'super_admin'
);

-- 11. Super admins can view all audit trail
DROP POLICY IF EXISTS "Users can view audit trail for their workshop job cards" ON public.audit_trail;

CREATE POLICY "Users can view audit trail or super admin"
ON public.audit_trail FOR SELECT
USING (
  (EXISTS (
    SELECT 1 FROM job_cards jc
    WHERE jc.id = audit_trail.job_card_id 
    AND is_user_in_workshop(jc.workshop_id)
  ))
  OR get_user_role() = 'super_admin'
);

-- 12. Function to reassign job cards when removing a user
CREATE OR REPLACE FUNCTION public.reassign_user_job_cards(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_workshop_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.job_cards 
  SET assigned_to = p_to_user_id
  WHERE assigned_to = p_from_user_id
    AND workshop_id = p_workshop_id
    AND status NOT IN ('DELIVERED', 'CLOSED');
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
