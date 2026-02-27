
-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_trail_jc_created_desc ON public.audit_trail (job_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_cards_workshop_status ON public.job_cards (workshop_id, status);
CREATE INDEX IF NOT EXISTS idx_job_cards_created_at ON public.job_cards (created_at);

-- WIP Snapshot RPC: returns per-day status counts where each JC is counted exactly once
-- using its latest status at end-of-day cutoff (or now() for today)
CREATE OR REPLACE FUNCTION public.get_wip_snapshot(
  p_start_date date,
  p_end_date date,
  p_workshop_id uuid DEFAULT NULL,
  p_country text DEFAULT NULL
)
RETURNS TABLE(snapshot_date date, status text, jc_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_role NOT IN ('super_admin', 'system_admin', 'country_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT d::date AS dt
    FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, '1 day'::interval) d
  ),
  relevant_jcs AS (
    SELECT jc.id, jc.created_at
    FROM job_cards jc
    WHERE (p_workshop_id IS NULL OR jc.workshop_id = p_workshop_id)
      AND (p_country IS NULL OR EXISTS (
        SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = p_country
      ))
  ),
  -- Combined timeline: initial DRAFT creation + all audit trail transitions
  status_events AS (
    SELECT rj.id AS job_card_id, rj.created_at AS event_at, 'DRAFT'::text AS evt_status
    FROM relevant_jcs rj
    UNION ALL
    SELECT a.job_card_id, a.created_at AS event_at, a.to_status::text AS evt_status
    FROM audit_trail a
    WHERE a.job_card_id IN (SELECT id FROM relevant_jcs)
  ),
  -- For today use now(), for past days use 23:59:59
  cutoffs AS (
    SELECT dt,
      CASE WHEN dt = CURRENT_DATE THEN now()
      ELSE (dt + interval '1 day' - interval '1 second')
      END AS cutoff
    FROM date_series
  ),
  -- Pick latest status per JC per day
  jc_day_status AS (
    SELECT DISTINCT ON (c.dt, se.job_card_id)
      c.dt,
      se.job_card_id,
      se.evt_status
    FROM cutoffs c
    JOIN status_events se ON se.event_at <= c.cutoff
    ORDER BY c.dt, se.job_card_id, se.event_at DESC
  )
  SELECT jds.dt AS snapshot_date, jds.evt_status AS status, count(*) AS jc_count
  FROM jc_day_status jds
  GROUP BY jds.dt, jds.evt_status
  ORDER BY jds.dt, jds.evt_status;
END;
$$;

-- Aging data RPC: returns open JCs with idle/total age info
CREATE OR REPLACE FUNCTION public.get_aging_data(
  p_workshop_id uuid DEFAULT NULL,
  p_country text DEFAULT NULL
)
RETURNS TABLE(
  job_card_id uuid,
  jc_number text,
  reg_no text,
  workshop_name text,
  current_status text,
  created_at timestamptz,
  last_status_change_at timestamptz,
  assigned_to_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_role NOT IN ('super_admin', 'system_admin', 'country_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    jc.id AS job_card_id,
    jc.jc_number,
    v.reg_no,
    w.name AS workshop_name,
    jc.status::text AS current_status,
    jc.created_at,
    COALESCE(
      (SELECT max(a.created_at) FROM audit_trail a WHERE a.job_card_id = jc.id),
      jc.created_at
    ) AS last_status_change_at,
    p.full_name AS assigned_to_name
  FROM job_cards jc
  JOIN vehicles v ON v.id = jc.vehicle_id
  JOIN workshops w ON w.id = jc.workshop_id
  LEFT JOIN profiles p ON p.id = jc.assigned_to
  WHERE jc.status IN ('DRAFT', 'INWARDED', 'IN_PROGRESS', 'READY', 'REOPENED')
    AND (p_workshop_id IS NULL OR jc.workshop_id = p_workshop_id)
    AND (p_country IS NULL OR w.country = p_country)
  ORDER BY COALESCE(
    (SELECT max(a.created_at) FROM audit_trail a WHERE a.job_card_id = jc.id),
    jc.created_at
  ) ASC
  LIMIT 50;
END;
$$;
