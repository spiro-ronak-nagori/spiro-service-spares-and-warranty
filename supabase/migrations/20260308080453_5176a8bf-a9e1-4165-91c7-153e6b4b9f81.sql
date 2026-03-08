-- Fix audit_trail SELECT: replace restrictive policy with permissive one
DROP POLICY IF EXISTS "Users can view audit trail scoped" ON public.audit_trail;

CREATE POLICY "Users can view audit trail scoped"
ON public.audit_trail FOR SELECT
TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM job_cards jc
    WHERE jc.id = audit_trail.job_card_id
    AND is_user_in_workshop(jc.workshop_id)
  ))
  OR (get_user_role() = 'super_admin'::user_role)
  OR (get_user_role() = 'system_admin'::user_role)
  OR (
    (get_user_role() = 'country_admin'::user_role)
    AND (EXISTS (
      SELECT 1 FROM job_cards jc
      JOIN workshops w ON w.id = jc.workshop_id
      WHERE jc.id = audit_trail.job_card_id
      AND w.country = get_user_country()
    ))
  )
);