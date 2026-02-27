
CREATE OR REPLACE FUNCTION public.generate_report_snapshots(p_target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_start_date date;
BEGIN
  v_start_date := p_target_date - interval '30 days';

  -- Delete existing snapshots for the date range (refresh)
  DELETE FROM public.report_daily_snapshot
  WHERE snapshot_date >= v_start_date AND snapshot_date <= p_target_date;

  -- Insert fresh snapshots: one row per (date, country, workshop, service_type)
  INSERT INTO public.report_daily_snapshot (
    snapshot_date, country, workshop_id, service_type, workshop_type,
    total_created, total_delivered, active_floor, pending_delivery,
    avg_mttr_minutes, avg_turnaround_minutes, reopen_percent, avg_feedback_score,
    draft_count, inwarded_count, in_progress_count, ready_count,
    delivered_count, closed_count, reopened_count,
    draft_to_inwarded_avg, inwarded_to_progress_avg,
    progress_to_ready_avg, ready_to_delivered_avg
  )
  SELECT
    d.dt AS snapshot_date,
    w.country,
    w.id AS workshop_id,
    'ALL' AS service_type,
    w.type::text AS workshop_type,
    -- Created on this day
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt THEN 1 ELSE 0 END), 0) AS total_created,
    -- Delivered on this day
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt THEN 1 ELSE 0 END), 0) AS total_delivered,
    -- Active floor: jobs in non-terminal state as of this date (created before or on date, not yet delivered/closed by date)
    COALESCE(SUM(CASE
      WHEN jc.created_at::date <= d.dt
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt)
        AND (jc.closed_at IS NULL OR jc.closed_at::date > d.dt)
        AND jc.status NOT IN ('COMPLETED', 'CLOSED')
      THEN 1 ELSE 0
    END), 0) AS active_floor,
    -- Pending delivery: READY status as of date
    COALESCE(SUM(CASE
      WHEN jc.work_completed_at IS NOT NULL AND jc.work_completed_at::date <= d.dt
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt)
      THEN 1 ELSE 0
    END), 0) AS pending_delivery,
    -- Avg MTTR (minutes) for jobs completed on this day
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0) AS avg_mttr_minutes,
    -- Avg turnaround for jobs delivered on this day
    COALESCE(AVG(CASE
      WHEN jc.delivered_at::date = d.dt
      THEN EXTRACT(EPOCH FROM (jc.delivered_at - jc.created_at)) / 60.0
    END), 0) AS avg_turnaround_minutes,
    -- Reopen % for jobs created in last 30 days from this date
    COALESCE(
      100.0 * SUM(CASE WHEN jc.status = 'REOPENED' AND jc.created_at::date <= d.dt AND jc.created_at::date > d.dt - 30 THEN 1 ELSE 0 END)::numeric
      / NULLIF(SUM(CASE WHEN jc.created_at::date <= d.dt AND jc.created_at::date > d.dt - 30 THEN 1 ELSE 0 END), 0),
      0
    ) AS reopen_percent,
    -- Avg feedback score placeholder (needs feedback_responses join)
    0 AS avg_feedback_score,
    -- Status counts as of this date (snapshot of current status for jobs that existed on this date)
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt AND jc.status = 'DRAFT' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt AND jc.status = 'INWARDED' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt AND jc.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt AND jc.status = 'READY' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.closed_at::date = d.dt THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt AND jc.status = 'REOPENED' THEN 1 ELSE 0 END), 0),
    -- Stage TATs (avg minutes for transitions completed on this date)
    COALESCE(AVG(CASE
      WHEN jc.inwarded_at::date = d.dt
      THEN EXTRACT(EPOCH FROM (jc.inwarded_at - jc.created_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.work_started_at::date = d.dt AND jc.inwarded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_started_at - jc.inwarded_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.delivered_at::date = d.dt AND jc.work_completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.delivered_at - jc.work_completed_at)) / 60.0
    END), 0)
  FROM public.workshops w
  CROSS JOIN generate_series(v_start_date, p_target_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.job_cards jc ON jc.workshop_id = w.id
    AND jc.created_at::date <= d.dt
  WHERE w.country IS NOT NULL
  GROUP BY d.dt, w.country, w.id, w.type;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('rows_inserted', v_count);
END;
$function$;
