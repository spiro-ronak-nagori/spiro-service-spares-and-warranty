
-- 1. Create spare action type enum
DO $$ BEGIN
  CREATE TYPE public.spare_action_type AS ENUM (
    'SUBMIT', 'APPROVE', 'REJECT', 'REQUEST_INFO', 'TECH_RESPONSE', 'RESUBMIT', 'EDIT_RESET'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create warranty_admin_assignments table
CREATE TABLE IF NOT EXISTS public.warranty_admin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  country_id text,
  workshop_id uuid REFERENCES public.workshops(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.warranty_admin_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage warranty assignments"
  ON public.warranty_admin_assignments
  FOR ALL
  USING (get_user_role() IN ('super_admin', 'system_admin'))
  WITH CHECK (get_user_role() IN ('super_admin', 'system_admin'));

CREATE POLICY "Warranty admins can view own assignments"
  ON public.warranty_admin_assignments
  FOR SELECT
  USING (admin_user_id = auth.uid());

-- 3. Create job_card_spare_actions audit table
CREATE TABLE IF NOT EXISTS public.job_card_spare_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_spare_id uuid NOT NULL REFERENCES public.job_card_spares(id) ON DELETE CASCADE,
  action_type public.spare_action_type NOT NULL,
  comment text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_spare_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view spare actions scoped"
  ON public.job_card_spare_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM job_card_spares jcs
      JOIN job_cards jc ON jc.id = jcs.job_card_id
      WHERE jcs.id = job_card_spare_actions.job_card_spare_id
      AND (
        is_user_in_workshop(jc.workshop_id)
        OR get_user_role() IN ('super_admin', 'system_admin')
        OR (get_user_role() = 'country_admin' AND EXISTS (
          SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = get_user_country()
        ))
        OR (get_user_role() = 'warranty_admin' AND EXISTS (
          SELECT 1 FROM warranty_admin_assignments waa
          WHERE waa.admin_user_id = auth.uid() AND waa.active = true
          AND (waa.workshop_id IS NULL OR waa.workshop_id = jc.workshop_id)
          AND (waa.country_id IS NULL OR waa.country_id = (SELECT w2.country FROM workshops w2 WHERE w2.id = jc.workshop_id))
        ))
      )
    )
  );

CREATE POLICY "Users can insert spare actions"
  ON public.job_card_spare_actions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_card_spares jcs
      JOIN job_cards jc ON jc.id = jcs.job_card_id
      WHERE jcs.id = job_card_spare_actions.job_card_spare_id
      AND (
        is_user_in_workshop(jc.workshop_id)
        OR get_user_role() IN ('super_admin', 'system_admin')
        OR (get_user_role() = 'warranty_admin' AND EXISTS (
          SELECT 1 FROM warranty_admin_assignments waa
          WHERE waa.admin_user_id = auth.uid() AND waa.active = true
          AND (waa.workshop_id IS NULL OR waa.workshop_id = jc.workshop_id)
          AND (waa.country_id IS NULL OR waa.country_id = (SELECT w2.country FROM workshops w2 WHERE w2.id = jc.workshop_id))
        ))
      )
    )
  );

-- 4. Warranty admin RLS on existing tables
CREATE POLICY "Warranty admins can view job card spares in scope"
  ON public.job_card_spares
  FOR SELECT
  USING (
    get_user_role() = 'warranty_admin' AND EXISTS (
      SELECT 1 FROM job_cards jc
      JOIN workshops w ON w.id = jc.workshop_id
      JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
      WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_id IS NULL OR waa.workshop_id = jc.workshop_id)
      AND (waa.country_id IS NULL OR waa.country_id = w.country)
    )
  );

CREATE POLICY "Warranty admins can update spares in scope"
  ON public.job_card_spares
  FOR UPDATE
  USING (
    get_user_role() = 'warranty_admin' AND EXISTS (
      SELECT 1 FROM job_cards jc
      JOIN workshops w ON w.id = jc.workshop_id
      JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
      WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_id IS NULL OR waa.workshop_id = jc.workshop_id)
      AND (waa.country_id IS NULL OR waa.country_id = w.country)
    )
  );

CREATE POLICY "Warranty admins can view job cards in scope"
  ON public.job_cards
  FOR SELECT
  USING (
    get_user_role() = 'warranty_admin' AND EXISTS (
      SELECT 1 FROM workshops w
      JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
      WHERE w.id = job_cards.workshop_id
      AND (waa.workshop_id IS NULL OR waa.workshop_id = w.id)
      AND (waa.country_id IS NULL OR waa.country_id = w.country)
    )
  );

CREATE POLICY "Warranty admins can view workshops in scope"
  ON public.workshops
  FOR SELECT
  USING (
    get_user_role() = 'warranty_admin' AND EXISTS (
      SELECT 1 FROM warranty_admin_assignments waa
      WHERE waa.admin_user_id = auth.uid() AND waa.active = true
      AND (waa.workshop_id IS NULL OR waa.workshop_id = workshops.id)
      AND (waa.country_id IS NULL OR waa.country_id = workshops.country)
    )
  );

CREATE POLICY "Warranty admins can view spare photos in scope"
  ON public.job_card_spare_photos
  FOR SELECT
  USING (
    get_user_role() = 'warranty_admin' AND EXISTS (
      SELECT 1 FROM job_card_spares jcs
      JOIN job_cards jc ON jc.id = jcs.job_card_id
      JOIN workshops w ON w.id = jc.workshop_id
      JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
      WHERE jcs.id = job_card_spare_photos.job_card_spare_id
      AND (waa.workshop_id IS NULL OR waa.workshop_id = jc.workshop_id)
      AND (waa.country_id IS NULL OR waa.country_id = w.country)
    )
  );

CREATE POLICY "Warranty admins can view profiles"
  ON public.profiles
  FOR SELECT
  USING (get_user_role() = 'warranty_admin');

CREATE POLICY "Warranty admins can read spare parts"
  ON public.spare_parts_master
  FOR SELECT
  USING (get_user_role() = 'warranty_admin');
