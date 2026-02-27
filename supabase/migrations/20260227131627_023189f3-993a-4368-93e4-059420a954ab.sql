
ALTER TABLE public.spare_parts_master
  ADD COLUMN IF NOT EXISTS warranty_approval_needed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS goodwill_approval_needed BOOLEAN NOT NULL DEFAULT TRUE;
