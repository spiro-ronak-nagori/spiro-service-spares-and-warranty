
-- Fix warranty admin RLS policies: country_ids stores ISO2 codes but workshops.country stores full names
-- Need to join countries_master to translate ISO2 -> name for comparison

-- 1. Fix job_card_spares SELECT policy
DROP POLICY IF EXISTS "Warranty admins can view job card spares in scope" ON public.job_card_spares;
CREATE POLICY "Warranty admins can view job card spares in scope"
ON public.job_card_spares FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role) AND (EXISTS (
    SELECT 1
    FROM job_cards jc
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}'::text[] OR EXISTS (
        SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
      ))
  ))
);

-- 2. Fix job_card_spares UPDATE policy
DROP POLICY IF EXISTS "Warranty admins can update spares in scope" ON public.job_card_spares;
CREATE POLICY "Warranty admins can update spares in scope"
ON public.job_card_spares FOR UPDATE
USING (
  (get_user_role() = 'warranty_admin'::user_role) AND (EXISTS (
    SELECT 1
    FROM job_cards jc
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jc.id = job_card_spares.job_card_id
      AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}'::text[] OR EXISTS (
        SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
      ))
  ))
);

-- 3. Fix job_cards SELECT policy for warranty admin
DROP POLICY IF EXISTS "Warranty admins can view job cards in scope" ON public.job_cards;
CREATE POLICY "Warranty admins can view job cards in scope"
ON public.job_cards FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role) AND (EXISTS (
    SELECT 1
    FROM workshops w
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE w.id = job_cards.workshop_id
      AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}'::text[] OR EXISTS (
        SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
      ))
  ))
);

-- 4. Fix job_card_spare_photos SELECT policy for warranty admin
DROP POLICY IF EXISTS "Warranty admins can view spare photos in scope" ON public.job_card_spare_photos;
CREATE POLICY "Warranty admins can view spare photos in scope"
ON public.job_card_spare_photos FOR SELECT
USING (
  (get_user_role() = 'warranty_admin'::user_role) AND (EXISTS (
    SELECT 1
    FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    JOIN workshops w ON w.id = jc.workshop_id
    JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
    WHERE jcs.id = job_card_spare_photos.job_card_spare_id
      AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
      AND (waa.country_ids = '{}'::text[] OR EXISTS (
        SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
      ))
  ))
);

-- 5. Fix job_card_spare_actions SELECT policy for warranty admin
DROP POLICY IF EXISTS "Users can view spare actions scoped" ON public.job_card_spare_actions;
CREATE POLICY "Users can view spare actions scoped"
ON public.job_card_spare_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    WHERE jcs.id = job_card_spare_actions.job_card_spare_id
      AND (
        is_user_in_workshop(jc.workshop_id)
        OR (get_user_role() = ANY(ARRAY['super_admin'::user_role, 'system_admin'::user_role]))
        OR ((get_user_role() = 'country_admin'::user_role) AND EXISTS (
          SELECT 1 FROM workshops w WHERE w.id = jc.workshop_id AND w.country = get_user_country()
        ))
        OR ((get_user_role() = 'warranty_admin'::user_role) AND EXISTS (
          SELECT 1
          FROM workshops w
          JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
          WHERE w.id = jc.workshop_id
            AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
            AND (waa.country_ids = '{}'::text[] OR EXISTS (
              SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
            ))
        ))
      )
  )
);

-- 6. Fix job_card_spare_actions INSERT policy for warranty admin
DROP POLICY IF EXISTS "Users can insert spare actions" ON public.job_card_spare_actions;
CREATE POLICY "Users can insert spare actions"
ON public.job_card_spare_actions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM job_card_spares jcs
    JOIN job_cards jc ON jc.id = jcs.job_card_id
    WHERE jcs.id = job_card_spare_actions.job_card_spare_id
      AND (
        is_user_in_workshop(jc.workshop_id)
        OR (get_user_role() = ANY(ARRAY['super_admin'::user_role, 'system_admin'::user_role]))
        OR ((get_user_role() = 'warranty_admin'::user_role) AND EXISTS (
          SELECT 1
          FROM workshops w
          JOIN warranty_admin_assignments waa ON waa.admin_user_id = auth.uid() AND waa.active = true
          WHERE w.id = jc.workshop_id
            AND (waa.workshop_ids = '{}'::uuid[] OR w.id = ANY(waa.workshop_ids))
            AND (waa.country_ids = '{}'::text[] OR EXISTS (
              SELECT 1 FROM countries_master cm WHERE cm.iso2 = ANY(waa.country_ids) AND cm.name = w.country
            ))
        ))
      )
  )
);
