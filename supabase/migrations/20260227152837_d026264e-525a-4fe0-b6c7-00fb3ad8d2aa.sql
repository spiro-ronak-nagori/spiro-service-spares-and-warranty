
-- 0. Drop ALL policies that depend on old country_id / workshop_id columns FIRST
DROP POLICY IF EXISTS "Warranty admins can view job cards in scope" ON public.job_cards;
DROP POLICY IF EXISTS "Warranty admins can update spares in scope" ON public.job_card_spares;
DROP POLICY IF EXISTS "Warranty admins can view job card spares in scope" ON public.job_card_spares;
DROP POLICY IF EXISTS "Users can insert spare actions" ON public.job_card_spare_actions;
DROP POLICY IF EXISTS "Users can view spare actions scoped" ON public.job_card_spare_actions;
DROP POLICY IF EXISTS "Warranty admins can view spare photos in scope" ON public.job_card_spare_photos;
DROP POLICY IF EXISTS "Warranty admins can view workshops in scope" ON public.workshops;

-- 1. Add new array columns (IF NOT EXISTS via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warranty_admin_assignments' AND column_name='country_ids') THEN
    ALTER TABLE public.warranty_admin_assignments ADD COLUMN country_ids text[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warranty_admin_assignments' AND column_name='workshop_ids') THEN
    ALTER TABLE public.warranty_admin_assignments ADD COLUMN workshop_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- 2. Migrate existing data (safe even if already migrated)
UPDATE public.warranty_admin_assignments
SET country_ids = CASE WHEN country_id IS NOT NULL AND country_ids = '{}' THEN ARRAY[country_id] ELSE country_ids END,
    workshop_ids = CASE WHEN workshop_id IS NOT NULL AND workshop_ids = '{}' THEN ARRAY[workshop_id] ELSE workshop_ids END
WHERE country_id IS NOT NULL OR workshop_id IS NOT NULL;

-- 3. Drop FK and old columns
ALTER TABLE public.warranty_admin_assignments DROP CONSTRAINT IF EXISTS warranty_admin_assignments_workshop_id_fkey;
ALTER TABLE public.warranty_admin_assignments DROP COLUMN IF EXISTS country_id;
ALTER TABLE public.warranty_admin_assignments DROP COLUMN IF EXISTS workshop_id;

-- 4. RLS on warranty_admin_assignments
DROP POLICY IF EXISTS "System admins can manage warranty assignments" ON public.warranty_admin_assignments;
DROP POLICY IF EXISTS "Admins can manage warranty assignments" ON public.warranty_admin_assignments;
CREATE POLICY "Admins can manage warranty assignments"
ON public.warranty_admin_assignments FOR ALL
USING (get_user_role() IN ('system_admin', 'super_admin'))
WITH CHECK (get_user_role() IN ('system_admin', 'super_admin'));

DROP POLICY IF EXISTS "Warranty admins can view own assignments" ON public.warranty_admin_assignments;
CREATE POLICY "Warranty admins can view own assignments"
ON public.warranty_admin_assignments FOR SELECT
USING (admin_user_id = auth.uid() AND active = true);

-- 5. Recreate RLS on job_cards
CREATE POLICY "Warranty admins can view job cards in scope"
ON public.job_cards FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role)
  AND EXISTS (
    SELECT 1 FROM workshops w
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE w.id = job_cards.workshop_id
      AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
  )
);

-- 6. Recreate RLS on job_card_spares
CREATE POLICY "Warranty admins can update spares in scope"
ON public.job_card_spares FOR UPDATE
USING (
  (get_user_role() = 'warranty_admin'::user_role)
  AND EXISTS (
    SELECT 1 FROM job_cards jc
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
  )
);

CREATE POLICY "Warranty admins can view job card spares in scope"
ON public.job_card_spares FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role)
  AND EXISTS (
    SELECT 1 FROM job_cards jc
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
  )
);

-- 7. Recreate RLS on job_card_spare_actions
CREATE POLICY "Users can insert spare actions"
ON public.job_card_spare_actions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    WHERE jcs.id = job_card_spare_actions.job_card_spare_id
      AND (
        is_user_in_workshop(jc.workshop_id)
        OR get_user_role() IN ('super_admin', 'system_admin')
        OR (
          get_user_role() = 'warranty_admin'
          AND EXISTS (
            SELECT 1 FROM warranty_admin_assignments waa
            JOIN workshops w ON w.id = jc.workshop_id
            WHERE waa.admin_user_id = auth.uid() AND waa.active = true
              AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
              AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
          )
        )
      )
  )
);

CREATE POLICY "Users can view spare actions scoped"
ON public.job_card_spare_actions FOR SELECT
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
        OR (
          get_user_role() = 'warranty_admin'
          AND EXISTS (
            SELECT 1 FROM warranty_admin_assignments waa
            JOIN workshops w ON w.id = jc.workshop_id
            WHERE waa.admin_user_id = auth.uid() AND waa.active = true
              AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
              AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
          )
        )
      )
  )
);

-- 8. Recreate RLS on job_card_spare_photos
CREATE POLICY "Warranty admins can view spare photos in scope"
ON public.job_card_spare_photos FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role)
  AND EXISTS (
    SELECT 1 FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jcs.id = job_card_spare_photos.job_card_spare_id
      AND (waa.workshop_ids = '{}' OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}' OR w.country = ANY(waa.country_ids))
  )
);

-- 9. Recreate workshops scope policy for warranty admins
CREATE POLICY "Warranty admins can view workshops in scope"
ON public.workshops FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role)
  AND EXISTS (
    SELECT 1 FROM warranty_admin_assignments waa
    WHERE waa.admin_user_id = auth.uid() AND waa.active = true
      AND (waa.workshop_ids = '{}' OR workshops.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}' OR workshops.country = ANY(waa.country_ids))
  )
);

-- 10. User invites policies for elevated admins
DROP POLICY IF EXISTS "Elevated admins can create invites" ON public.user_invites;
CREATE POLICY "Elevated admins can create invites"
ON public.user_invites FOR INSERT
WITH CHECK (get_user_role() IN ('super_admin', 'system_admin'));

DROP POLICY IF EXISTS "Elevated admins can view invites" ON public.user_invites;
CREATE POLICY "Elevated admins can view invites"
ON public.user_invites FOR SELECT
USING (get_user_role() IN ('super_admin', 'system_admin'));

DROP POLICY IF EXISTS "Elevated admins can delete invites" ON public.user_invites;
CREATE POLICY "Elevated admins can delete invites"
ON public.user_invites FOR DELETE
USING (get_user_role() IN ('super_admin', 'system_admin'));
