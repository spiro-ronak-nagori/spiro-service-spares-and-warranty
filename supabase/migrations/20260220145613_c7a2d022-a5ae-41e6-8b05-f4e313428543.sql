-- Fix RLS policies for feedback_form_templates, feedback_form_questions, and service_categories
-- to allow system_admin the same access as super_admin

-- feedback_form_templates: drop and recreate "Super admins can manage templates"
DROP POLICY IF EXISTS "Super admins can manage templates" ON public.feedback_form_templates;
CREATE POLICY "Super admins can manage templates"
  ON public.feedback_form_templates
  FOR ALL
  USING (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role))
  WITH CHECK (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

-- feedback_form_questions: drop and recreate "Super admins can manage questions"
DROP POLICY IF EXISTS "Super admins can manage questions" ON public.feedback_form_questions;
CREATE POLICY "Super admins can manage questions"
  ON public.feedback_form_questions
  FOR ALL
  USING (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role))
  WITH CHECK (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

-- service_categories: drop and recreate insert/update policies for super_admin
DROP POLICY IF EXISTS "Super admins can insert service categories" ON public.service_categories;
CREATE POLICY "Super admins can insert service categories"
  ON public.service_categories
  FOR INSERT
  WITH CHECK (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

DROP POLICY IF EXISTS "Super admins can update service categories" ON public.service_categories;
CREATE POLICY "Super admins can update service categories"
  ON public.service_categories
  FOR UPDATE
  USING (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

-- Fix countries_master: allow system_admin same as super_admin
DROP POLICY IF EXISTS "Super admins can manage countries" ON public.countries_master;
CREATE POLICY "Super admins can manage countries"
  ON public.countries_master
  FOR ALL
  USING (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role))
  WITH CHECK (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

-- Fix system_settings_audit: allow system_admin to view (they're the one changing settings)
DROP POLICY IF EXISTS "Super admins can view settings audit" ON public.system_settings_audit;
CREATE POLICY "Super admins can view settings audit"
  ON public.system_settings_audit
  FOR SELECT
  USING (get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role));

-- Fix job_cards RLS to include system_admin as elevated admin
DROP POLICY IF EXISTS "Elevated admins can create job cards" ON public.job_cards;
CREATE POLICY "Elevated admins can create job cards"
  ON public.job_cards
  FOR INSERT
  WITH CHECK (
    get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (
      get_user_role() = 'country_admin'::user_role
      AND EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = job_cards.workshop_id
          AND w.country = get_user_country()
      )
    )
  );

DROP POLICY IF EXISTS "Elevated admins can update any job card" ON public.job_cards;
CREATE POLICY "Elevated admins can update any job card"
  ON public.job_cards
  FOR UPDATE
  USING (
    get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (
      get_user_role() = 'country_admin'::user_role
      AND EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = job_cards.workshop_id
          AND w.country = get_user_country()
      )
    )
  );

DROP POLICY IF EXISTS "Users can view job cards scoped" ON public.job_cards;
CREATE POLICY "Users can view job cards scoped"
  ON public.job_cards
  FOR SELECT
  USING (
    is_user_in_workshop(workshop_id)
    OR get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (
      get_user_role() = 'country_admin'::user_role
      AND EXISTS (
        SELECT 1 FROM workshops w
        WHERE w.id = job_cards.workshop_id
          AND w.country = get_user_country()
      )
    )
  );

-- Fix workshops: allow system_admin same as super_admin for create/update/delete
DROP POLICY IF EXISTS "Admins can create workshops" ON public.workshops;
CREATE POLICY "Admins can create workshops"
  ON public.workshops
  FOR INSERT
  WITH CHECK (
    get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (get_user_role() = 'country_admin'::user_role AND country = get_user_country())
  );

DROP POLICY IF EXISTS "Admins can update workshops" ON public.workshops;
CREATE POLICY "Admins can update workshops"
  ON public.workshops
  FOR UPDATE
  USING (
    get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (get_user_role() = 'country_admin'::user_role AND country = get_user_country())
  );

DROP POLICY IF EXISTS "Admins can delete workshops" ON public.workshops;
CREATE POLICY "Admins can delete workshops"
  ON public.workshops
  FOR DELETE
  USING (
    get_user_role() IN ('super_admin'::user_role, 'system_admin'::user_role)
    OR (get_user_role() = 'country_admin'::user_role AND country = get_user_country())
  );