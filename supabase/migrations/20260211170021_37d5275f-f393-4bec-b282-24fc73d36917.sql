
-- Allow super admins to insert service categories
CREATE POLICY "Super admins can insert service categories"
ON public.service_categories
FOR INSERT
WITH CHECK (get_user_role() = 'super_admin'::user_role);

-- Allow super admins to update service categories (for edits and soft-deletes)
CREATE POLICY "Super admins can update service categories"
ON public.service_categories
FOR UPDATE
USING (get_user_role() = 'super_admin'::user_role);
