
-- ============================================================
-- (1) Atomic Job Card Status Transition RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_job_card_status(
  p_job_card_id uuid,
  p_new_status public.job_card_status,
  p_notes text DEFAULT NULL,
  p_additional_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_old_status  public.job_card_status;
  v_workshop_id uuid;
  v_actor_id    uuid;
  v_profile_id  uuid;
  v_role        public.user_role;
  v_user_country text;
  v_ws_country  text;
  v_now         timestamptz := now();
  v_update_sql  text;
BEGIN
  -- Resolve actor
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: not authenticated';
  END IF;

  -- Get caller profile
  SELECT p.id, p.role, p.workshop_id, p.country
    INTO v_profile_id, v_role, v_workshop_id, v_user_country
    FROM public.profiles p
   WHERE p.user_id = v_actor_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no profile found';
  END IF;

  -- Lock the row to prevent concurrent transitions
  SELECT jc.status, jc.workshop_id
    INTO v_old_status, v_workshop_id
    FROM public.job_cards jc
   WHERE jc.id = p_job_card_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: job card does not exist';
  END IF;

  -- Workshop authorization check
  IF v_role = 'super_admin' THEN
    NULL; -- allowed
  ELSIF v_role = 'country_admin' THEN
    SELECT w.country INTO v_ws_country FROM public.workshops w WHERE w.id = v_workshop_id;
    IF v_user_country IS DISTINCT FROM v_ws_country THEN
      RAISE EXCEPTION 'UNAUTHORIZED: job card belongs to a different country';
    END IF;
  ELSE
    -- technician / workshop_admin: must be in same workshop
    DECLARE v_user_ws uuid;
    BEGIN
      SELECT p.workshop_id INTO v_user_ws FROM public.profiles p WHERE p.user_id = v_actor_id;
      IF v_user_ws IS DISTINCT FROM v_workshop_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: job card belongs to a different workshop';
      END IF;
    END;
  END IF;

  -- Strict transition validation (mirrors STATUS_TRANSITIONS in app)
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

  -- Update status + updated_at + status-specific timestamp
  UPDATE public.job_cards
     SET status     = p_new_status,
         updated_at = v_now,
         inwarded_at       = CASE WHEN p_new_status = 'INWARDED'    THEN v_now ELSE inwarded_at END,
         work_started_at   = CASE WHEN p_new_status = 'IN_PROGRESS' THEN v_now ELSE work_started_at END,
         work_completed_at = CASE WHEN p_new_status = 'READY'       THEN v_now ELSE work_completed_at END,
         delivered_at      = CASE WHEN p_new_status = 'DELIVERED'    THEN v_now ELSE delivered_at END,
         closed_at         = CASE WHEN p_new_status = 'CLOSED'      THEN v_now ELSE closed_at END,
         -- Apply additional data fields if provided
         inwarding_otp_verified = COALESCE((p_additional_data->>'inwarding_otp_verified')::boolean, inwarding_otp_verified),
         delivery_otp_verified  = COALESCE((p_additional_data->>'delivery_otp_verified')::boolean, delivery_otp_verified),
         completion_remarks     = COALESCE(p_additional_data->>'completion_remarks', completion_remarks),
         service_categories     = CASE WHEN p_additional_data ? 'service_categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_additional_data->'service_categories')) ELSE service_categories END,
         issue_categories       = CASE WHEN p_additional_data ? 'issue_categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_additional_data->'issue_categories')) ELSE issue_categories END
   WHERE id = p_job_card_id;

  -- Insert audit trail
  INSERT INTO public.audit_trail (job_card_id, user_id, from_status, to_status, notes, created_at)
  VALUES (p_job_card_id, v_profile_id, v_old_status, p_new_status, p_notes, v_now);

  RETURN jsonb_build_object(
    'job_card_id', p_job_card_id,
    'old_status',  v_old_status,
    'new_status',  p_new_status,
    'updated_at',  v_now
  );
END;
$fn$;

-- ============================================================
-- (2) Sequence-based JC Number Generator
-- ============================================================

-- Create a global sequence, seeded past current max
CREATE SEQUENCE IF NOT EXISTS public.job_card_number_seq START WITH 1;

-- Seed it past any existing job cards (idempotent: setval to max+1 if > current)
DO $$
DECLARE
  v_max_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(jc_number FROM 11) AS INTEGER)), 0)
    INTO v_max_seq
    FROM public.job_cards
   WHERE jc_number IS NOT NULL AND LENGTH(jc_number) >= 11;
  
  -- setval sets the LAST returned value, so next nextval = v_max_seq + 1
  IF v_max_seq > 0 THEN
    PERFORM setval('public.job_card_number_seq', v_max_seq);
  END IF;
END $$;

-- Replace the generate_jc_number function to use the sequence (O(1), no table scan)
CREATE OR REPLACE FUNCTION public.generate_jc_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT;
  v_seq  BIGINT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  v_seq  := nextval('public.job_card_number_seq');
  RETURN 'JC' || v_date || LPAD(v_seq::TEXT, 4, '0');
END;
$function$;

-- ============================================================
-- ROLLBACK INSTRUCTIONS (run manually if needed):
-- ============================================================
-- DROP FUNCTION IF EXISTS public.transition_job_card_status(uuid, public.job_card_status, text, jsonb);
--
-- DROP SEQUENCE IF EXISTS public.job_card_number_seq;
--
-- -- Restore original generate_jc_number:
-- CREATE OR REPLACE FUNCTION public.generate_jc_number()
--  RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $function$
-- DECLARE v_date TEXT; v_seq INTEGER; v_jc_number TEXT;
-- BEGIN
--   v_date := to_char(now(), 'YYYYMMDD');
--   SELECT COALESCE(MAX(CAST(SUBSTRING(jc_number FROM 11) AS INTEGER)), 0) + 1
--     INTO v_seq FROM public.job_cards WHERE jc_number LIKE 'JC' || v_date || '%';
--   v_jc_number := 'JC' || v_date || LPAD(v_seq::TEXT, 4, '0');
--   RETURN v_jc_number;
-- END; $function$;
