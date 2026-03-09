
-- 1. Feature flag
INSERT INTO public.system_settings (key, value)
VALUES ('ENABLE_VEHICLE_CHECKLIST', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Checklist response type enum
CREATE TYPE public.checklist_response_type AS ENUM ('none', 'text', 'photo', 'text_photo');

-- 3. Checklist templates master
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active checklist templates"
  ON public.checklist_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage checklist templates"
  ON public.checklist_templates FOR ALL
  TO authenticated
  USING (get_user_role() IN ('system_admin', 'super_admin'))
  WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- 4. Checklist template items
CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  response_type public.checklist_response_type NOT NULL DEFAULT 'none',
  is_mandatory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active checklist items"
  ON public.checklist_template_items FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage checklist items"
  ON public.checklist_template_items FOR ALL
  TO authenticated
  USING (get_user_role() IN ('system_admin', 'super_admin'))
  WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- 5. Checklist template applicability (by vehicle model)
CREATE TABLE public.checklist_template_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  vehicle_model_id uuid NOT NULL REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, vehicle_model_id)
);

ALTER TABLE public.checklist_template_applicability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read checklist applicability"
  ON public.checklist_template_applicability FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage checklist applicability"
  ON public.checklist_template_applicability FOR ALL
  TO authenticated
  USING (get_user_role() IN ('system_admin', 'super_admin'))
  WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- 6. Checklist runs (one per job card)
CREATE TABLE public.checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id),
  template_name_snapshot text NOT NULL,
  completed_by uuid NOT NULL REFERENCES public.profiles(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_card_id)
);

ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workshop users can view checklist runs"
  ON public.checklist_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = checklist_runs.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
    OR (get_user_role() = 'country_admin' AND EXISTS (
      SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id
      WHERE jc.id = checklist_runs.job_card_id AND w.country = get_user_country()
    ))
  );

CREATE POLICY "Workshop users can insert checklist runs"
  ON public.checklist_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = checklist_runs.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
  );

-- 7. Checklist run item responses
CREATE TABLE public.checklist_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_run_id uuid NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  template_item_id uuid NOT NULL REFERENCES public.checklist_template_items(id),
  label_snapshot text NOT NULL,
  response_type_snapshot public.checklist_response_type NOT NULL,
  is_mandatory_snapshot boolean NOT NULL,
  text_response text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workshop users can view checklist run items"
  ON public.checklist_run_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM checklist_runs cr
      JOIN job_cards jc ON jc.id = cr.job_card_id
      WHERE cr.id = checklist_run_items.checklist_run_id
      AND (is_user_in_workshop(jc.workshop_id) OR get_user_role() IN ('super_admin', 'system_admin')
        OR (get_user_role() = 'country_admin' AND EXISTS (
          SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = get_user_country()
        ))
      )
    )
  );

CREATE POLICY "Workshop users can insert checklist run items"
  ON public.checklist_run_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklist_runs cr
      JOIN job_cards jc ON jc.id = cr.job_card_id
      WHERE cr.id = checklist_run_items.checklist_run_id
      AND (is_user_in_workshop(jc.workshop_id) OR get_user_role() IN ('super_admin', 'system_admin'))
    )
  );

-- 8. Storage bucket for checklist photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-photos', 'checklist-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for checklist-photos bucket
CREATE POLICY "Auth users can upload checklist photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'checklist-photos');

CREATE POLICY "Auth users can read checklist photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'checklist-photos');
