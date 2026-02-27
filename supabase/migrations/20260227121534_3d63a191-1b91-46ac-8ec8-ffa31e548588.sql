
-- 1. Create approval_state enum
CREATE TYPE public.approval_state AS ENUM (
  'DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'RESUBMITTED', 'APPROVED', 'REJECTED'
);

-- 2. Extend job_card_spares with approval columns
ALTER TABLE public.job_card_spares
  ADD COLUMN approval_state public.approval_state NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN last_submitted_at timestamptz,
  ADD COLUMN decided_at timestamptz;

-- 3. Extend job_card_spare_photos with slot tracking
ALTER TABLE public.job_card_spare_photos
  ADD COLUMN is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN slot_index integer,
  ADD COLUMN prompt text;
