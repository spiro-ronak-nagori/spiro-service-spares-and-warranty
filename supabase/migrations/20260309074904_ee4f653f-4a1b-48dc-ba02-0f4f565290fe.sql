
-- Add scoping columns to checklist_templates
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS country_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS workshop_ids uuid[] NOT NULL DEFAULT '{}';

-- Add photo prompts to checklist_template_items
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS photo_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS photo_prompts jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Update checklist_run_items to support multiple photos as JSON array
ALTER TABLE public.checklist_run_items
  ALTER COLUMN photo_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
