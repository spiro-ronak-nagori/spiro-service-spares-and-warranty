
-- Drop old restrictive policies
DROP POLICY "Workshop users can create vehicles" ON public.vehicles;
DROP POLICY "Workshop users can update vehicles" ON public.vehicles;

-- Recreate INSERT policy: allow workshop users, super_admins, and country_admins
CREATE POLICY "Authorized users can create vehicles"
ON public.vehicles FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND (p.workshop_id IS NOT NULL OR p.role IN ('super_admin', 'country_admin'))
  )
);

-- Recreate UPDATE policy similarly
CREATE POLICY "Authorized users can update vehicles"
ON public.vehicles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND (p.workshop_id IS NOT NULL OR p.role IN ('super_admin', 'country_admin'))
  )
);
