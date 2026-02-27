
CREATE OR REPLACE FUNCTION public.get_wip_snapshot(p_start_date date, p_end_date date, p_workshop_id uuid DEFAULT NULL::uuid, p_country text DEFAULT NULL::text)
 RETURNS TABLE(snapshot_date date, status text, jc_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_role NOT IN ('super_admin', 'system_admin', 'country_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH relevant_jcs AS (
    SELECT jc.id
    FROM job_cards jc
    WHERE (p_workshop_id IS NULL OR jc.workshop_id = p_workshop_id)
      AND (p_country IS NULL OR EXISTS (
        SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = p_country
      ))
  ),
  -- All status transitions within the date range
  status_events AS (
    SELECT a.job_card_id, a.created_at::date AS event_date, a.to_status::text AS evt_status, a.created_at
    FROM audit_trail a
    WHERE a.job_card_id IN (SELECT id FROM relevant_jcs)
      AND a.created_at::date >= p_start_date
      AND a.created_at::date <= p_end_date
      AND a.to_status != 'DRAFT'
  ),
  -- Dedupe: keep only the LAST status per JC per day
  deduped AS (
    SELECT DISTINCT ON (event_date, job_card_id)
      event_date, job_card_id, evt_status
    FROM status_events
    ORDER BY event_date, job_card_id, created_at DESC
  )
  SELECT d.event_date AS snapshot_date, d.evt_status AS status, count(*) AS jc_count
  FROM deduped d
  GROUP BY d.event_date, d.evt_status
  ORDER BY d.event_date, d.evt_status;
END;
$function$;
