
-- 1) Add color_code to vehicles with CHECK constraint
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS color_code text;

ALTER TABLE public.vehicles
ADD CONSTRAINT vehicles_color_code_check
CHECK (color_code IS NULL OR color_code IN ('RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'));

-- Backfill color_code from existing color column
UPDATE public.vehicles
SET color_code = CASE
  WHEN upper(trim(color)) IN ('RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK') THEN upper(trim(color))
  ELSE NULL
END
WHERE color IS NOT NULL AND color_code IS NULL;

-- 2) Add requires_spares to service_categories
ALTER TABLE public.service_categories
ADD COLUMN IF NOT EXISTS requires_spares boolean NOT NULL DEFAULT false;

-- 3) Create enums
CREATE TYPE public.claim_type AS ENUM ('USER_PAID', 'WARRANTY', 'GOODWILL');
CREATE TYPE public.spare_photo_kind AS ENUM ('NEW_PART_PROOF', 'OLD_PART_EVIDENCE', 'ADDITIONAL');

-- 4) Create spare_parts_master
CREATE TABLE public.spare_parts_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name text NOT NULL,
  part_code text,
  active boolean NOT NULL DEFAULT true,
  max_qty_allowed integer NOT NULL DEFAULT 50,
  partno_required boolean NOT NULL DEFAULT false,
  serial_required boolean NOT NULL DEFAULT false,
  usage_proof_photos_required_count integer NOT NULL DEFAULT 0,
  usage_proof_photo_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  warranty_available boolean NOT NULL DEFAULT true,
  goodwill_available boolean NOT NULL DEFAULT true,
  warranty_old_part_photos_required_count integer NOT NULL DEFAULT 1,
  warranty_old_part_photo_prompts jsonb NOT NULL DEFAULT '["Old part close-up"]'::jsonb,
  goodwill_old_part_photos_required_count integer NOT NULL DEFAULT 1,
  goodwill_old_part_photo_prompts jsonb NOT NULL DEFAULT '["Old part close-up"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spare_parts_master ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read active parts
CREATE POLICY "Authenticated can read active spare parts"
ON public.spare_parts_master FOR SELECT
TO authenticated
USING (active = true);

-- RLS: system_admin and super_admin can manage
CREATE POLICY "Admins can manage spare parts"
ON public.spare_parts_master FOR ALL
TO authenticated
USING (get_user_role() IN ('system_admin', 'super_admin'))
WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- Updated_at trigger
CREATE TRIGGER update_spare_parts_master_updated_at
BEFORE UPDATE ON public.spare_parts_master
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Create spare_parts_applicability
CREATE TABLE public.spare_parts_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id uuid NOT NULL REFERENCES public.spare_parts_master(id) ON DELETE CASCADE,
  vehicle_model_id uuid NOT NULL REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  color_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicability_color_code_check CHECK (color_code IS NULL OR color_code IN ('RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK')),
  CONSTRAINT unique_applicability UNIQUE (spare_part_id, vehicle_model_id, color_code)
);

ALTER TABLE public.spare_parts_applicability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read applicability"
ON public.spare_parts_applicability FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage applicability"
ON public.spare_parts_applicability FOR ALL
TO authenticated
USING (get_user_role() IN ('system_admin', 'super_admin'))
WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- 6) Create job_card_spares
CREATE TABLE public.job_card_spares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  spare_part_id uuid NOT NULL REFERENCES public.spare_parts_master(id),
  qty integer NOT NULL DEFAULT 1,
  claim_type public.claim_type NOT NULL DEFAULT 'USER_PAID',
  part_number text,
  serial_number text,
  technician_comment text,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_spares ENABLE ROW LEVEL SECURITY;

-- Workshop users can CRUD spares on their job cards
CREATE POLICY "Workshop users can view job card spares"
ON public.job_card_spares FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_spares.job_card_id AND is_user_in_workshop(jc.workshop_id))
  OR get_user_role() IN ('super_admin', 'system_admin')
  OR (get_user_role() = 'country_admin' AND EXISTS (
    SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id
    WHERE jc.id = job_card_spares.job_card_id AND w.country = get_user_country()
  ))
);

CREATE POLICY "Workshop users can insert job card spares"
ON public.job_card_spares FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_spares.job_card_id AND is_user_in_workshop(jc.workshop_id))
  OR get_user_role() IN ('super_admin', 'system_admin')
);

CREATE POLICY "Workshop users can update job card spares"
ON public.job_card_spares FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_spares.job_card_id AND is_user_in_workshop(jc.workshop_id))
  OR get_user_role() IN ('super_admin', 'system_admin')
);

CREATE POLICY "Workshop users can delete job card spares"
ON public.job_card_spares FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_spares.job_card_id AND is_user_in_workshop(jc.workshop_id))
  OR get_user_role() IN ('super_admin', 'system_admin')
);

CREATE TRIGGER update_job_card_spares_updated_at
BEFORE UPDATE ON public.job_card_spares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Create job_card_spare_photos
CREATE TABLE public.job_card_spare_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_spare_id uuid NOT NULL REFERENCES public.job_card_spares(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_kind public.spare_photo_kind NOT NULL,
  description_prompt text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_spare_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workshop users can view spare photos"
ON public.job_card_spare_photos FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    WHERE jcs.id = job_card_spare_photos.job_card_spare_id
    AND (is_user_in_workshop(jc.workshop_id) OR get_user_role() IN ('super_admin', 'system_admin')
      OR (get_user_role() = 'country_admin' AND EXISTS (
        SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = get_user_country()
      ))
    )
  )
);

CREATE POLICY "Workshop users can insert spare photos"
ON public.job_card_spare_photos FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    WHERE jcs.id = job_card_spare_photos.job_card_spare_id
    AND (is_user_in_workshop(jc.workshop_id) OR get_user_role() IN ('super_admin', 'system_admin'))
  )
);

-- 8) Storage bucket for spare photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('spare-photos', 'spare-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Workshop users can upload spare photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'spare-photos');

CREATE POLICY "Authenticated can view spare photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'spare-photos');
