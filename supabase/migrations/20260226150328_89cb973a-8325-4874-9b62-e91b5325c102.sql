
ALTER TABLE public.report_daily_snapshot 
ADD COLUMN IF NOT EXISTS feedback_count integer NOT NULL DEFAULT 0;
