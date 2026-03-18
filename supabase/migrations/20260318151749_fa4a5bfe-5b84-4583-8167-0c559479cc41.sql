
-- Add usage approval columns to job_card_spares
ALTER TABLE public.job_card_spares
  ADD COLUMN IF NOT EXISTS usage_approval_state text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS usage_approved_by uuid,
  ADD COLUMN IF NOT EXISTS usage_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS usage_rejection_comment text,
  ADD COLUMN IF NOT EXISTS usage_approved_qty integer;

-- Add new spare action types to the enum
ALTER TYPE public.spare_action_type ADD VALUE IF NOT EXISTS 'USAGE_REQUEST';
ALTER TYPE public.spare_action_type ADD VALUE IF NOT EXISTS 'USAGE_APPROVE';
ALTER TYPE public.spare_action_type ADD VALUE IF NOT EXISTS 'USAGE_REJECT';
