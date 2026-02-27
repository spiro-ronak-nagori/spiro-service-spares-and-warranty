
-- Table for rate-limiting exports
CREATE TABLE public.export_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  export_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can access this table
CREATE POLICY "Service role can manage export audit"
  ON public.export_audit_log FOR ALL
  USING (true) WITH CHECK (true);

-- Index for rate limit lookups
CREATE INDEX idx_export_audit_user_type ON public.export_audit_log (user_id, export_type, created_at DESC);

-- RPC function for CSV export data
CREATE OR REPLACE FUNCTION public.export_job_cards_csv(
  p_date_from date,
  p_date_to date,
  p_country text DEFAULT NULL,
  p_workshop_id uuid DEFAULT NULL
)
RETURNS TABLE(
  workshop_name text,
  technician_name text,
  vehicle_number text,
  odometer integer,
  jc_number text,
  jc_status text,
  service_issues text,
  inward_ts timestamptz,
  work_start_ts timestamptz,
  work_end_ts timestamptz,
  delivered_ts timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.name,
    COALESCE(p.full_name, '-'),
    v.reg_no,
    jc.odometer,
    jc.jc_number,
    jc.status::text,
    COALESCE(array_to_string(jc.service_categories || jc.issue_categories, ', '), ''),
    jc.inwarded_at,
    jc.work_started_at,
    jc.work_completed_at,
    jc.delivered_at
  FROM job_cards jc
  JOIN workshops w ON w.id = jc.workshop_id
  JOIN vehicles v ON v.id = jc.vehicle_id
  LEFT JOIN profiles p ON p.id = jc.assigned_to
  WHERE jc.created_at >= p_date_from::timestamptz
    AND jc.created_at < (p_date_to + interval '1 day')::timestamptz
    AND (p_country IS NULL OR w.country = p_country)
    AND (p_workshop_id IS NULL OR jc.workshop_id = p_workshop_id)
  ORDER BY jc.created_at DESC
  LIMIT 10001;
END;
$$;
