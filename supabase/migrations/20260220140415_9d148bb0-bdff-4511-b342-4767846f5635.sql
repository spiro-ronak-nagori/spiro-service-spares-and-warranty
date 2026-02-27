
-- Update generate_report_snapshots: total_created = jobs inwarded on that day (not just created)
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
  v_start_date := p_target_date - 30;

  DELETE FROM public.report_daily_snapshot
  WHERE snapshot_date >= v_start_date AND snapshot_date <= p_target_date;

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
    d.dt::date AS snapshot_date,
    w.country,
    w.id AS workshop_id,
    'ALL' AS service_type,
    w.type::text AS workshop_type,
    -- total_created: jobs INWARDED on this day (draft → inwarded = actual creation)
    COALESCE(SUM(CASE WHEN jc.inwarded_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    -- total_delivered: job cards delivered on this day
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    -- active_floor: jobs on floor (INWARDED, IN_PROGRESS, READY, REOPENED) — excludes DRAFT
    COALESCE(SUM(CASE
      WHEN jc.created_at::date <= d.dt::date
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt::date)
        AND (jc.closed_at IS NULL OR jc.closed_at::date > d.dt::date)
        AND jc.status IN ('INWARDED', 'IN_PROGRESS', 'READY', 'REOPENED')
      THEN 1 ELSE 0
    END), 0),
    -- pending_delivery: jobs in READY status on this day
    COALESCE(SUM(CASE
      WHEN jc.work_completed_at IS NOT NULL AND jc.work_completed_at::date <= d.dt::date
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt::date)
      THEN 1 ELSE 0
    END), 0),
    -- avg_mttr_minutes: IN_PROGRESS → READY (work_started_at → work_completed_at)
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt::date AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0),
    -- avg_turnaround_minutes: INWARDED → DELIVERED (inwarded_at → delivered_at)
    COALESCE(AVG(CASE
      WHEN jc.delivered_at::date = d.dt::date AND jc.inwarded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.delivered_at - jc.inwarded_at)) / 60.0
    END), 0),
    -- reopen_percent: % of jobs reopened in rolling 30 days
    COALESCE(
      100.0 * SUM(CASE WHEN jc.status = 'REOPENED' AND jc.created_at::date <= d.dt::date AND jc.created_at::date > (d.dt::date - 30) THEN 1 ELSE 0 END)::numeric
      / NULLIF(SUM(CASE WHEN jc.created_at::date <= d.dt::date AND jc.created_at::date > (d.dt::date - 30) THEN 1 ELSE 0 END), 0),
      0
    ),
    -- avg_feedback_score placeholder
    0,
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt::date AND jc.status = 'DRAFT' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.inwarded_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.work_started_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.work_completed_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.closed_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt::date AND jc.status = 'REOPENED' THEN 1 ELSE 0 END), 0),
    -- draft_to_inwarded_avg
    COALESCE(AVG(CASE
      WHEN jc.inwarded_at::date = d.dt::date
      THEN EXTRACT(EPOCH FROM (jc.inwarded_at - jc.created_at)) / 60.0
    END), 0),
    -- inwarded_to_progress_avg
    COALESCE(AVG(CASE
      WHEN jc.work_started_at::date = d.dt::date AND jc.inwarded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_started_at - jc.inwarded_at)) / 60.0
    END), 0),
    -- progress_to_ready_avg (work_started_at → work_completed_at)
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt::date AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0),
    -- ready_to_delivered_avg
    COALESCE(AVG(CASE
      WHEN jc.delivered_at::date = d.dt::date AND jc.work_completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.delivered_at - jc.work_completed_at)) / 60.0
    END), 0)
  FROM public.workshops w
  CROSS JOIN generate_series(v_start_date::timestamp, p_target_date::timestamp, '1 day'::interval) AS d(dt)
  LEFT JOIN public.job_cards jc ON jc.workshop_id = w.id
    AND jc.created_at::date <= d.dt::date
  WHERE w.country IS NOT NULL
  GROUP BY d.dt, w.country, w.id, w.type;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('rows_inserted', v_count);
END;
$function$;
