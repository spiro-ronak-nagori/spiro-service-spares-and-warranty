
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
  date_series AS (
    SELECT d::date AS day_date
    FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, '1 day'::interval) d
  ),
  -- All audit events for relevant JCs (excluding DRAFT)
  all_events AS (
    SELECT a.job_card_id, a.to_status::text AS evt_status, a.created_at
    FROM audit_trail a
    WHERE a.job_card_id IN (SELECT id FROM relevant_jcs)
      AND a.to_status NOT IN ('DRAFT')
  ),
  -- A) WIP carry-forward: for each day, find latest status per JC as of EOD
  -- Only count if that status is an active work status
  wip_snapshot AS (
    SELECT ds.day_date, ae.job_card_id, ae.evt_status
    FROM date_series ds
    CROSS JOIN LATERAL (
      SELECT DISTINCT ON (e.job_card_id) e.job_card_id, e.evt_status
      FROM all_events e
      WHERE e.created_at::date <= ds.day_date
      ORDER BY e.job_card_id, e.created_at DESC
    ) ae
    WHERE ae.evt_status IN ('INWARDED', 'IN_PROGRESS', 'READY', 'REOPENED')
  ),
  wip_counts AS (
    SELECT w.day_date AS snapshot_date, w.evt_status AS status, count(DISTINCT w.job_card_id) AS jc_count
    FROM wip_snapshot w
    GROUP BY w.day_date, w.evt_status
  ),
  -- B) Delivered daily: count JC only on the day of its FIRST delivery
  first_delivered AS (
    SELECT e.job_card_id, min(e.created_at)::date AS delivered_date
    FROM all_events e
    WHERE e.evt_status = 'DELIVERED'
    GROUP BY e.job_card_id
  ),
  delivered_counts AS (
    SELECT fd.delivered_date AS snapshot_date, 'DELIVERED'::text AS status, count(DISTINCT fd.job_card_id) AS jc_count
    FROM first_delivered fd
    WHERE fd.delivered_date >= p_start_date AND fd.delivered_date <= p_end_date
    GROUP BY fd.delivered_date
  )
  -- Combine
  SELECT c.snapshot_date, c.status, c.jc_count
  FROM (
    SELECT * FROM wip_counts
    UNION ALL
    SELECT * FROM delivered_counts
  ) c
  ORDER BY c.snapshot_date, c.status;
END;
$function$;
