
-- Add SOC (State of Charge) columns to job_cards
ALTER TABLE public.job_cards
  ADD COLUMN incoming_soc integer DEFAULT NULL,
  ADD COLUMN soc_photo_url text DEFAULT NULL;
