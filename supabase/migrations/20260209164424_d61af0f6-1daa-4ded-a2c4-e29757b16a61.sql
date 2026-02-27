-- Allow workshop admins to delete invites for their workshop
CREATE POLICY "Admins can delete invites for their workshop"
ON public.user_invites
FOR DELETE
USING (
  (get_user_role() = 'workshop_admin'::user_role) 
  AND (workshop_id = get_user_workshop_id())
);