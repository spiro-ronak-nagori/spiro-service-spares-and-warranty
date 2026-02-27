
-- Add old_part_srno_required to spare_parts_master
ALTER TABLE public.spare_parts_master
  ADD COLUMN IF NOT EXISTS old_part_srno_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Add old_part_serial_number and claim_comment to job_card_spares
ALTER TABLE public.job_card_spares
  ADD COLUMN IF NOT EXISTS old_part_serial_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS claim_comment TEXT NULL;
