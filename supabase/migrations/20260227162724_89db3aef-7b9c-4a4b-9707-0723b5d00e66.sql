-- 1. Add submitted_by column to job_card_spares
ALTER TABLE public.job_card_spares 
ADD COLUMN IF NOT EXISTS submitted_by uuid NULL;

-- 2. Add WITHDRAW to spare_action_type enum
ALTER TYPE public.spare_action_type ADD VALUE IF NOT EXISTS 'WITHDRAW';

-- 3. Add denormalized columns to job_card_spare_actions
ALTER TABLE public.job_card_spare_actions 
ADD COLUMN IF NOT EXISTS job_card_id uuid NULL,
ADD COLUMN IF NOT EXISTS workshop_id uuid NULL;
