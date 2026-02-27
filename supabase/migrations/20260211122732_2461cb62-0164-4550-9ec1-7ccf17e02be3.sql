
-- Helper functions that reference country_admin
CREATE OR REPLACE FUNCTION public.is_country_admin_for(p_country text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'country_admin'
    AND p.country = p_country
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workshop(p_workshop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.user_role;
  v_user_country text;
  v_workshop_country text;
BEGIN
  SELECT p.role, p.country INTO v_role, v_user_country
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;

  IF v_role = 'country_admin' THEN
    SELECT w.country INTO v_workshop_country FROM public.workshops w WHERE w.id = p_workshop_id;
    RETURN v_user_country IS NOT NULL AND v_user_country = v_workshop_country;
  END IF;

  RETURN FALSE;
END;
$$;

-- Workshop policies
DROP POLICY IF EXISTS "Super admins can create workshops" ON public.workshops;
CREATE POLICY "Admins can create workshops" ON public.workshops FOR INSERT
WITH CHECK (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND country = get_user_country()));

DROP POLICY IF EXISTS "Super admins can update workshops" ON public.workshops;
CREATE POLICY "Admins can update workshops" ON public.workshops FOR UPDATE
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND country = get_user_country()));

DROP POLICY IF EXISTS "Super admins can delete workshops" ON public.workshops;
CREATE POLICY "Admins can delete workshops" ON public.workshops FOR DELETE
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND country = get_user_country()));

-- Job cards policies
DROP POLICY IF EXISTS "Users can view job cards from their workshop or super admin" ON public.job_cards;
CREATE POLICY "Users can view job cards scoped" ON public.job_cards FOR SELECT
USING (
  is_user_in_workshop(workshop_id) OR get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM public.workshops w WHERE w.id = job_cards.workshop_id AND w.country = get_user_country()))
);

DROP POLICY IF EXISTS "Super admins can update any job card" ON public.job_cards;
CREATE POLICY "Elevated admins can update any job card" ON public.job_cards FOR UPDATE
USING (
  get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM public.workshops w WHERE w.id = job_cards.workshop_id AND w.country = get_user_country()))
);

-- Audit trail policies
DROP POLICY IF EXISTS "Users can view audit trail or super admin" ON public.audit_trail;
CREATE POLICY "Users can view audit trail scoped" ON public.audit_trail FOR SELECT
USING (
  EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = audit_trail.job_card_id AND is_user_in_workshop(jc.workshop_id))
  OR get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id WHERE jc.id = audit_trail.job_card_id AND w.country = get_user_country()))
);

DROP POLICY IF EXISTS "Super admins can create audit trail entries" ON public.audit_trail;
CREATE POLICY "Elevated admins can create audit trail entries" ON public.audit_trail FOR INSERT
WITH CHECK (
  get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id WHERE jc.id = audit_trail.job_card_id AND w.country = get_user_country()))
);

-- User invites policies
DROP POLICY IF EXISTS "Super admins can view all invites" ON public.user_invites;
CREATE POLICY "Elevated admins can view invites" ON public.user_invites FOR SELECT
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND (workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = user_invites.workshop_id AND w.country = get_user_country()))));

DROP POLICY IF EXISTS "Super admins can create invites" ON public.user_invites;
CREATE POLICY "Elevated admins can create invites" ON public.user_invites FOR INSERT
WITH CHECK (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND (workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = user_invites.workshop_id AND w.country = get_user_country()))));

DROP POLICY IF EXISTS "Super admins can update invites" ON public.user_invites;
CREATE POLICY "Elevated admins can update invites" ON public.user_invites FOR UPDATE
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND (workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = user_invites.workshop_id AND w.country = get_user_country()))));

DROP POLICY IF EXISTS "Super admins can delete invites" ON public.user_invites;
CREATE POLICY "Elevated admins can delete invites" ON public.user_invites FOR DELETE
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND (workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = user_invites.workshop_id AND w.country = get_user_country()))));

-- Profiles policies
DROP POLICY IF EXISTS "Users can view profiles in their workshop or super admin" ON public.profiles;
CREATE POLICY "Users can view profiles scoped" ON public.profiles FOR SELECT
USING (
  user_id = auth.uid() OR workshop_id = get_user_workshop_id() OR get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND (workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = profiles.workshop_id AND w.country = get_user_country())))
);

DROP POLICY IF EXISTS "Super admins can update any profile" ON public.profiles;
CREATE POLICY "Elevated admins can update any profile" ON public.profiles FOR UPDATE
USING (
  get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND (profiles.workshop_id IS NULL OR EXISTS (SELECT 1 FROM workshops w WHERE w.id = profiles.workshop_id AND w.country = get_user_country())))
);

-- OTP codes policies
DROP POLICY IF EXISTS "Super admins can create OTP codes" ON public.otp_codes;
CREATE POLICY "Elevated admins can create OTP codes" ON public.otp_codes FOR INSERT
WITH CHECK (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id WHERE jc.id = otp_codes.job_card_id AND w.country = get_user_country())));

DROP POLICY IF EXISTS "Super admins can update OTP codes" ON public.otp_codes;
CREATE POLICY "Elevated admins can update OTP codes" ON public.otp_codes FOR UPDATE
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id WHERE jc.id = otp_codes.job_card_id AND w.country = get_user_country())));

DROP POLICY IF EXISTS "Super admins can view OTP codes" ON public.otp_codes;
CREATE POLICY "Elevated admins can view OTP codes" ON public.otp_codes FOR SELECT
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id WHERE jc.id = otp_codes.job_card_id AND w.country = get_user_country())));

-- SMS audit log
DROP POLICY IF EXISTS "Super admins can view SMS logs" ON public.sms_audit_log;
CREATE POLICY "Elevated admins can view SMS logs" ON public.sms_audit_log FOR SELECT
USING (get_user_role() = 'super_admin' OR (get_user_role() = 'country_admin' AND EXISTS (SELECT 1 FROM workshops w WHERE w.id = sms_audit_log.workshop_id AND w.country = get_user_country())));

-- Update protect_profile_fields trigger for country_admin
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.user_role;
  v_workshop_id UUID;
  v_country text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT p.role, p.workshop_id, p.country INTO v_role, v_workshop_id, v_country
  FROM public.profiles p WHERE p.user_id = auth.uid();
  
  IF v_role = 'super_admin' THEN RETURN NEW; END IF;

  IF v_role = 'country_admin' THEN
    IF OLD.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
    IF OLD.workshop_id IS NOT NULL THEN
      DECLARE v_workshop_country text;
      BEGIN
        SELECT w.country INTO v_workshop_country FROM public.workshops w WHERE w.id = OLD.workshop_id;
        IF v_workshop_country IS DISTINCT FROM v_country THEN
          RAISE EXCEPTION 'Cannot modify users outside your country';
        END IF;
      END;
    END IF;
    RETURN NEW;
  END IF;
  
  IF v_role = 'workshop_admin' AND OLD.workshop_id = v_workshop_id THEN
    IF OLD.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
    RETURN NEW;
  END IF;
  
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Cannot modify role'; END IF;
  IF NEW.workshop_id IS DISTINCT FROM OLD.workshop_id THEN RAISE EXCEPTION 'Cannot modify workshop assignment'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cannot modify status'; END IF;
  
  RETURN NEW;
END;
$$;
