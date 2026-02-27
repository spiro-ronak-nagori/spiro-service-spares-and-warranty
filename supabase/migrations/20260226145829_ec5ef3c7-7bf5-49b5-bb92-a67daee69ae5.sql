
CREATE OR REPLACE FUNCTION public.generate_report_snapshots(p_target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    COALESCE(SUM(CASE WHEN jc.inwarded_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN jc.created_at::date <= d.dt::date
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt::date)
        AND (jc.closed_at IS NULL OR jc.closed_at::date > d.dt::date)
        AND jc.status IN ('INWARDED', 'IN_PROGRESS', 'REOPENED')
      THEN 1 ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN jc.status = 'READY'
        AND jc.work_completed_at IS NOT NULL AND jc.work_completed_at::date <= d.dt::date
        AND (jc.delivered_at IS NULL OR jc.delivered_at::date > d.dt::date)
      THEN 1 ELSE 0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt::date AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.delivered_at::date = d.dt::date AND jc.inwarded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.delivered_at - jc.inwarded_at)) / 60.0
    END), 0),
    COALESCE(
      100.0 * SUM(CASE WHEN jc.status = 'REOPENED' AND jc.created_at::date <= d.dt::date AND jc.created_at::date > (d.dt::date - 30) THEN 1 ELSE 0 END)::numeric
      / NULLIF(SUM(CASE WHEN jc.created_at::date <= d.dt::date AND jc.created_at::date > (d.dt::date - 30) THEN 1 ELSE 0 END), 0),
      0
    ),
    -- avg_feedback_score: average NPS (NPS_0_10) score for job cards delivered on this day in this workshop
    COALESCE((
      SELECT AVG(fres.numeric_value)
      FROM public.feedback_responses fres
      JOIN public.feedback_requests fr ON fr.id = fres.feedback_request_id
      JOIN public.feedback_form_questions fq ON fq.id = fres.question_id
      JOIN public.job_cards jc2 ON jc2.id = fres.job_card_id
      WHERE jc2.workshop_id = w.id
        AND jc2.delivered_at::date = d.dt::date
        AND fq.question_type = 'NPS_0_10'
        AND fr.status = 'SUBMITTED'
    ), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt::date AND jc.status = 'DRAFT' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.inwarded_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.work_started_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.work_completed_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.delivered_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.closed_at::date = d.dt::date THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN jc.created_at::date = d.dt::date AND jc.status = 'REOPENED' THEN 1 ELSE 0 END), 0),
    COALESCE(AVG(CASE
      WHEN jc.inwarded_at::date = d.dt::date
      THEN EXTRACT(EPOCH FROM (jc.inwarded_at - jc.created_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.work_started_at::date = d.dt::date AND jc.inwarded_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_started_at - jc.inwarded_at)) / 60.0
    END), 0),
    COALESCE(AVG(CASE
      WHEN jc.work_completed_at::date = d.dt::date AND jc.work_started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (jc.work_completed_at - jc.work_started_at)) / 60.0
    END), 0),
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
$$;
