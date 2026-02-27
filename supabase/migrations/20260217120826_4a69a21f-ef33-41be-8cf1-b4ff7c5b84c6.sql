
-- report_daily_snapshot: pre-aggregated daily metrics
CREATE TABLE public.report_daily_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  country text NOT NULL,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id),
  service_type text NOT NULL DEFAULT 'ALL',
  workshop_type text NOT NULL DEFAULT 'COCO',

  total_created integer NOT NULL DEFAULT 0,
  total_delivered integer NOT NULL DEFAULT 0,
  active_floor integer NOT NULL DEFAULT 0,
  pending_delivery integer NOT NULL DEFAULT 0,

  avg_mttr_minutes numeric NOT NULL DEFAULT 0,
  avg_turnaround_minutes numeric NOT NULL DEFAULT 0,
  reopen_percent numeric NOT NULL DEFAULT 0,
  avg_feedback_score numeric NOT NULL DEFAULT 0,

  draft_count integer NOT NULL DEFAULT 0,
  inwarded_count integer NOT NULL DEFAULT 0,
  in_progress_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  closed_count integer NOT NULL DEFAULT 0,
  reopened_count integer NOT NULL DEFAULT 0,

  draft_to_inwarded_avg numeric NOT NULL DEFAULT 0,
  inwarded_to_progress_avg numeric NOT NULL DEFAULT 0,
  progress_to_ready_avg numeric NOT NULL DEFAULT 0,
  ready_to_delivered_avg numeric NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(snapshot_date, country, workshop_id, service_type)
);

-- Indexes for fast filtered queries
CREATE INDEX idx_snapshot_date ON public.report_daily_snapshot(snapshot_date);
CREATE INDEX idx_snapshot_country ON public.report_daily_snapshot(country);
CREATE INDEX idx_snapshot_workshop ON public.report_daily_snapshot(workshop_id);
CREATE INDEX idx_snapshot_composite ON public.report_daily_snapshot(snapshot_date, country, workshop_id, service_type);

-- Enable RLS
ALTER TABLE public.report_daily_snapshot ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "Super admins can view all snapshots"
  ON public.report_daily_snapshot
  FOR SELECT
  USING (get_user_role() = 'super_admin'::user_role);

-- Country Admin: only their country
CREATE POLICY "Country admins can view own country snapshots"
  ON public.report_daily_snapshot
  FOR SELECT
  USING (
    get_user_role() = 'country_admin'::user_role
    AND country = get_user_country()
  );

-- Service role can insert/update (for edge function refresh)
CREATE POLICY "Service role can manage snapshots"
  ON public.report_daily_snapshot
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Throttle tracking table
CREATE TABLE public.report_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by uuid,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  row_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.report_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read refresh log"
  ON public.report_refresh_log
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert refresh log"
  ON public.report_refresh_log
  FOR INSERT
  WITH CHECK (true);
