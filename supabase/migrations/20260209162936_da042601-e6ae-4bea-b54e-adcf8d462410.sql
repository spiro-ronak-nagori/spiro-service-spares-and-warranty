-- Allow super admins to delete workshops
CREATE POLICY "Super admins can delete workshops"
ON public.workshops
FOR DELETE
USING (get_user_role() = 'super_admin'::user_role);

-- Restrict profiles SELECT to same workshop or super admin
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view profiles in their workshop or super admin"
ON public.profiles
FOR SELECT
USING (
  workshop_id = get_user_workshop_id()
  OR get_user_role() = 'super_admin'::user_role
  OR user_id = auth.uid()
);