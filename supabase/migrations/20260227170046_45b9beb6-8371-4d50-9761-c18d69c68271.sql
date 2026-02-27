
-- Add last-submitted identity snapshot columns to job_card_spares
ALTER TABLE public.job_card_spares
  ADD COLUMN IF NOT EXISTS last_submitted_spare_part_id uuid NULL,
  ADD COLUMN IF NOT EXISTS last_submitted_qty integer NULL,
  ADD COLUMN IF NOT EXISTS last_submitted_claim_type public.claim_type NULL;
