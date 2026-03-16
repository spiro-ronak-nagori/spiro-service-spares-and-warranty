
-- Add mechanic name column to job_cards
ALTER TABLE public.job_cards ADD COLUMN IF NOT EXISTS assigned_mechanic_name text;

-- Add backend guard: checklist must be completed before Start Work when country is enabled
CREATE OR REPLACE FUNCTION public.transition_job_card_status(p_job_card_id uuid, p_new_status job_card_status, p_notes text DEFAULT NULL::text, p_additional_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- CHECKLIST GUARD: block INWARDED -> IN_PROGRESS if checklist required but not completed
  IF v_old_status = 'INWARDED' AND p_new_status = 'IN_PROGRESS' THEN
    DECLARE
      v_checklist_setting text;
      v_checklist_countries jsonb;
      v_jc_country text;
      v_checklist_run_exists boolean;
      v_template_exists boolean;
    BEGIN
      SELECT value INTO v_checklist_setting FROM public.system_settings WHERE key = 'CHECKLIST_ENABLED_COUNTRIES';
      SELECT w.country INTO v_jc_country FROM public.workshops w WHERE w.id = v_workshop_id;

      IF v_checklist_setting IS NOT NULL AND v_checklist_setting != '' AND v_checklist_setting != '[]' AND v_jc_country IS NOT NULL THEN
        BEGIN
          v_checklist_countries := v_checklist_setting::jsonb;
        EXCEPTION WHEN OTHERS THEN
          v_checklist_countries := '[]'::jsonb;
        END;

        IF jsonb_array_length(v_checklist_countries) > 0 AND v_checklist_countries @> to_jsonb(v_jc_country) THEN
          SELECT EXISTS(SELECT 1 FROM public.checklist_runs cr WHERE cr.job_card_id = p_job_card_id) INTO v_checklist_run_exists;
          IF NOT v_checklist_run_exists THEN
            SELECT EXISTS(
              SELECT 1 FROM public.checklist_templates ct
              WHERE ct.is_active = true
              AND (ct.is_global = true
                   OR v_workshop_id = ANY(ct.workshop_ids)
                   OR v_jc_country = ANY(ct.country_ids))
            ) INTO v_template_exists;

            IF v_template_exists THEN
              RAISE EXCEPTION 'CHECKLIST_REQUIRED: Vehicle checklist must be completed before starting work';
            END IF;
          END IF;
        END IF;
      END IF;
    END;
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
         assigned_mechanic_name = COALESCE(p_additional_data->>'assigned_mechanic_name', assigned_mechanic_name),
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
$function$;
