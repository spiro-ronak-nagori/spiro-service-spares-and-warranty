
-- Add checklist_status column to job_cards
-- Values: NULL (not yet determined), 'PENDING', 'COMPLETED', 'NOT_APPLICABLE'
ALTER TABLE public.job_cards ADD COLUMN IF NOT EXISTS checklist_status text DEFAULT NULL;

-- Backfill: any job card that has a checklist_run → COMPLETED
UPDATE public.job_cards jc
SET checklist_status = 'COMPLETED'
WHERE EXISTS (SELECT 1 FROM public.checklist_runs cr WHERE cr.job_card_id = jc.id)
AND jc.checklist_status IS NULL;

-- Backfill: any job card past INWARDED without a checklist_run → NOT_APPLICABLE
UPDATE public.job_cards jc
SET checklist_status = 'NOT_APPLICABLE'
WHERE jc.status IN ('IN_PROGRESS', 'READY', 'DELIVERED', 'COMPLETED', 'CLOSED', 'REOPENED')
AND NOT EXISTS (SELECT 1 FROM public.checklist_runs cr WHERE cr.job_card_id = jc.id)
AND jc.checklist_status IS NULL;
