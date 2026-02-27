
-- Migration 2/2: Add system_admin functions, update RLS policies, update security functions

-- 1. is_system_admin() helper
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'system_admin'
  );
$$;

-- 2. Update can_manage_workshop() to treat system_admin like super_admin
CREATE OR REPLACE FUNCTION public.can_manage_workshop(p_workshop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_user_country text;
  v_workshop_country text;
BEGIN
  SELECT p.role, p.country INTO v_role, v_user_country
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_role IN ('super_admin', 'system_admin') THEN RETURN TRUE; END IF;

  IF v_role = 'country_admin' THEN
    SELECT w.country INTO v_workshop_country FROM public.workshops w WHERE w.id = p_workshop_id;
    RETURN v_user_country IS NOT NULL AND v_user_country = v_workshop_country;
  END IF;

  RETURN FALSE;
END;
$$;

-- 3. system_settings RLS: restrict UPDATE to system_admin only
DROP POLICY IF EXISTS "Super admins can update system settings" ON public.system_settings;
DROP POLICY IF EXISTS "System admins can update system settings" ON public.system_settings;

CREATE POLICY "System admins can update system settings"
ON public.system_settings
FOR UPDATE
USING (get_user_role() = 'system_admin'::user_role);

-- 4. profiles RLS: add system_admin
DROP POLICY IF EXISTS "Users can view profiles scoped" ON public.profiles;

CREATE POLICY "Users can view profiles scoped"
ON public.profiles
FOR SELECT
USING (
  (user_id = auth.uid())
  OR (workshop_id = get_user_workshop_id())
  OR (get_user_role() = 'super_admin'::user_role)
  OR (get_user_role() = 'system_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = profiles.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

DROP POLICY IF EXISTS "Elevated admins can update any profile" ON public.profiles;

CREATE POLICY "Elevated admins can update any profile"
ON public.profiles
FOR UPDATE
USING (
  (get_user_role() = 'super_admin'::user_role)
  OR (get_user_role() = 'system_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = profiles.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

-- 5. user_invites RLS: add system_admin
DROP POLICY IF EXISTS "Elevated admins can create invites" ON public.user_invites;
DROP POLICY IF EXISTS "Elevated admins can view invites" ON public.user_invites;
DROP POLICY IF EXISTS "Elevated admins can update invites" ON public.user_invites;
DROP POLICY IF EXISTS "Elevated admins can delete invites" ON public.user_invites;

CREATE POLICY "Elevated admins can create invites"
ON public.user_invites
FOR INSERT
WITH CHECK (
  (get_user_role() = 'system_admin'::user_role)
  OR (get_user_role() = 'super_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = user_invites.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

CREATE POLICY "Elevated admins can view invites"
ON public.user_invites
FOR SELECT
USING (
  (get_user_role() = 'system_admin'::user_role)
  OR (get_user_role() = 'super_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = user_invites.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

CREATE POLICY "Elevated admins can update invites"
ON public.user_invites
FOR UPDATE
USING (
  (get_user_role() = 'system_admin'::user_role)
  OR (get_user_role() = 'super_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = user_invites.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

CREATE POLICY "Elevated admins can delete invites"
ON public.user_invites
FOR DELETE
USING (
  (get_user_role() = 'system_admin'::user_role)
  OR (get_user_role() = 'super_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (
      (workshop_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = user_invites.workshop_id
          AND w.country = get_user_country()
      ))
    )
  )
);

-- 6. report_daily_snapshot RLS: add system_admin
DROP POLICY IF EXISTS "Super admins can view all snapshots" ON public.report_daily_snapshot;

CREATE POLICY "Super admins can view all snapshots"
ON public.report_daily_snapshot
FOR SELECT
USING (
  (get_user_role() = 'super_admin'::user_role)
  OR (get_user_role() = 'system_admin'::user_role)
);

-- 7. Update transition_job_card_status() to treat system_admin like super_admin
CREATE OR REPLACE FUNCTION public.transition_job_card_status(p_job_card_id uuid, p_new_status job_card_status, p_notes text DEFAULT NULL::text, p_additional_data jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_status  public.job_card_status;
  v_workshop_id uuid;
  v_actor_id    uuid;
  v_profile_id  uuid;
  v_role        public.user_role;
  v_user_country text;
  v_ws_country  text;
  v_now         timestamptz := now();
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: not authenticated';
  END IF;

  SELECT p.id, p.role, p.workshop_id, p.country
    INTO v_profile_id, v_role, v_workshop_id, v_user_country
    FROM public.profiles p
   WHERE p.user_id = v_actor_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no profile found';
  END IF;

  SELECT jc.status, jc.workshop_id
    INTO v_old_status, v_workshop_id
    FROM public.job_cards jc
   WHERE jc.id = p_job_card_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: job card does not exist';
  END IF;

  IF v_role IN ('super_admin', 'system_admin') THEN
    NULL;
  ELSIF v_role = 'country_admin' THEN
    SELECT w.country INTO v_ws_country FROM public.workshops w WHERE w.id = v_workshop_id;
    IF v_user_country IS DISTINCT FROM v_ws_country THEN
      RAISE EXCEPTION 'UNAUTHORIZED: job card belongs to a different country';
    END IF;
  ELSE
    DECLARE v_user_ws uuid;
    BEGIN
      SELECT p.workshop_id INTO v_user_ws FROM public.profiles p WHERE p.user_id = v_actor_id;
      IF v_user_ws IS DISTINCT FROM v_workshop_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: job card belongs to a different workshop';
      END IF;
    END;
  END IF;

  IF NOT (
    (v_old_status = 'DRAFT'       AND p_new_status = 'INWARDED')    OR
    (v_old_status = 'INWARDED'    AND p_new_status = 'IN_PROGRESS') OR
    (v_old_status = 'IN_PROGRESS' AND p_new_status = 'READY')      OR
    (v_old_status = 'READY'       AND p_new_status = 'DELIVERED')   OR
    (v_old_status = 'READY'       AND p_new_status = 'REOPENED')    OR
    (v_old_status = 'DELIVERED'   AND p_new_status = 'COMPLETED')   OR
    (v_old_status = 'REOPENED'    AND p_new_status = 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: cannot move from % to %', v_old_status, p_new_status;
  END IF;

  UPDATE public.job_cards
     SET status     = p_new_status,
         updated_at = v_now,
         inwarded_at       = CASE WHEN p_new_status = 'INWARDED'    THEN v_now ELSE inwarded_at END,
         work_started_at   = CASE WHEN p_new_status = 'IN_PROGRESS' THEN v_now ELSE work_started_at END,
         work_completed_at = CASE WHEN p_new_status = 'READY'       THEN v_now ELSE work_completed_at END,
         delivered_at      = CASE WHEN p_new_status = 'DELIVERED'    THEN v_now ELSE delivered_at END,
         closed_at         = CASE WHEN p_new_status = 'CLOSED'      THEN v_now ELSE closed_at END,
         inwarding_otp_verified = COALESCE((p_additional_data->>'inwarding_otp_verified')::boolean, inwarding_otp_verified),
         delivery_otp_verified  = COALESCE((p_additional_data->>'delivery_otp_verified')::boolean, delivery_otp_verified),
         completion_remarks     = COALESCE(p_additional_data->>'completion_remarks', completion_remarks),
         service_categories     = CASE WHEN p_additional_data ? 'service_categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_additional_data->'service_categories')) ELSE service_categories END,
         issue_categories       = CASE WHEN p_additional_data ? 'issue_categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_additional_data->'issue_categories')) ELSE issue_categories END
   WHERE id = p_job_card_id;

  INSERT INTO public.audit_trail (job_card_id, user_id, from_status, to_status, notes, created_at)
  VALUES (p_job_card_id, v_profile_id, v_old_status, p_new_status, p_notes, v_now);

  RETURN jsonb_build_object(
    'job_card_id', p_job_card_id,
    'old_status',  v_old_status,
    'new_status',  p_new_status,
    'updated_at',  v_now
  );
END;
$$;

-- 8. Update protect_profile_fields() to treat system_admin like super_admin
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

  IF v_role IN ('super_admin', 'system_admin') THEN RETURN NEW; END IF;

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
