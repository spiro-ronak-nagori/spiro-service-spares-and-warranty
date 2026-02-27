
-- Allow elevated admins to create job cards
CREATE POLICY "Elevated admins can create job cards"
ON public.job_cards FOR INSERT
WITH CHECK (
  (get_user_role() = 'super_admin'::user_role)
  OR (
    get_user_role() = 'country_admin'::user_role
    AND EXISTS (
      SELECT 1 FROM workshops w
      WHERE w.id = job_cards.workshop_id AND w.country = get_user_country()
    )
  )
);
