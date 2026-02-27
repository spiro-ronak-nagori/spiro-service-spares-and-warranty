
-- Add outgoing SOC columns to job_cards
ALTER TABLE public.job_cards
  ADD COLUMN out_soc_value integer,
  ADD COLUMN out_soc_photo_url text,
  ADD COLUMN out_soc_anomaly_flag boolean DEFAULT false,
  ADD COLUMN out_soc_override_reason text,
  ADD COLUMN out_soc_override_comment text,
  ADD COLUMN out_soc_detected_value integer,
  ADD COLUMN out_soc_detection_confidence numeric;

-- Create storage bucket for JC audit images
INSERT INTO storage.buckets (id, name, public)
VALUES ('jc-audit-images', 'jc-audit-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: workshop users can upload images for their job cards
CREATE POLICY "Workshop users can upload jc audit images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'jc-audit-images'
  AND auth.role() = 'authenticated'
);

-- Workshop users can view jc audit images
CREATE POLICY "Authenticated users can view jc audit images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'jc-audit-images'
  AND auth.role() = 'authenticated'
);
