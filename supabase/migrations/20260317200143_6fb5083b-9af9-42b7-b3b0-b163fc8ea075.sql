-- Labour master catalog (country-level)
CREATE TABLE public.labour_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  labour_code text,
  labour_name text NOT NULL,
  description text,
  standard_duration_minutes integer NOT NULL DEFAULT 60,
  default_rate numeric,
  duration_editable boolean NOT NULL DEFAULT true,
  rate_editable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Job card labour entries
CREATE TABLE public.job_card_labour (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  labour_master_id uuid NOT NULL REFERENCES public.labour_master(id),
  duration_minutes integer NOT NULL DEFAULT 60,
  rate numeric,
  remarks text,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Labour audit log
CREATE TABLE public.labour_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, -- 'CONFIG', 'MASTER', 'JC_LABOUR'
  entity_id uuid,
  job_card_id uuid,
  country text,
  action text NOT NULL,
  changed_field text,
  old_value text,
  new_value text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on labour_master
ALTER TABLE public.labour_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active labour_master"
  ON public.labour_master FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage labour_master"
  ON public.labour_master FOR ALL TO authenticated
  USING (get_user_role() IN ('system_admin', 'super_admin'))
  WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

-- RLS on job_card_labour
ALTER TABLE public.job_card_labour ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workshop users can view jc labour"
  ON public.job_card_labour FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_labour.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
    OR (get_user_role() = 'country_admin' AND EXISTS (
      SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id
      WHERE jc.id = job_card_labour.job_card_id AND w.country = get_user_country()
    ))
  );

CREATE POLICY "Workshop users can insert jc labour"
  ON public.job_card_labour FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_labour.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
  );

CREATE POLICY "Workshop users can update jc labour"
  ON public.job_card_labour FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_labour.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
  );

CREATE POLICY "Workshop users can delete jc labour"
  ON public.job_card_labour FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM job_cards jc WHERE jc.id = job_card_labour.job_card_id AND is_user_in_workshop(jc.workshop_id))
    OR get_user_role() IN ('super_admin', 'system_admin')
  );

-- RLS on labour_audit_log
ALTER TABLE public.labour_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage labour_audit_log"
  ON public.labour_audit_log FOR ALL TO authenticated
  USING (get_user_role() IN ('system_admin', 'super_admin'))
  WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

CREATE POLICY "Workshop users can insert labour audit"
  ON public.labour_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);