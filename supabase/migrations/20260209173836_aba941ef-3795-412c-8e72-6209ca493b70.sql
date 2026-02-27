
-- Add SOC anomaly flag and override tracking columns to job_cards
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS soc_anomaly_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS soc_override_reason text,
  ADD COLUMN IF NOT EXISTS soc_override_comment text,
  ADD COLUMN IF NOT EXISTS soc_detected_value integer,
  ADD COLUMN IF NOT EXISTS soc_detection_confidence integer;
