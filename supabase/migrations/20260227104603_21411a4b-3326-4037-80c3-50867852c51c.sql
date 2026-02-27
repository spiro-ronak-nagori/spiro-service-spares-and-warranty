
-- Fix vehicles INSERT policy to include system_admin
DROP POLICY "Authorized users can create vehicles" ON public.vehicles;
CREATE POLICY "Authorized users can create vehicles"
ON public.vehicles FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND (p.workshop_id IS NOT NULL OR p.role = ANY (ARRAY['super_admin'::user_role, 'country_admin'::user_role, 'system_admin'::user_role]))
  )
);

-- Fix vehicles UPDATE policy to include system_admin
DROP POLICY "Authorized users can update vehicles" ON public.vehicles;
CREATE POLICY "Authorized users can update vehicles"
ON public.vehicles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND (p.workshop_id IS NOT NULL OR p.role = ANY (ARRAY['super_admin'::user_role, 'country_admin'::user_role, 'system_admin'::user_role]))
  )
);
