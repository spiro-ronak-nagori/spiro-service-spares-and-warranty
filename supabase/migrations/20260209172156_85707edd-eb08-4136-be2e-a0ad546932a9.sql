-- Update profiles FK to CASCADE
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_workshop_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_workshop_id_fkey
  FOREIGN KEY (workshop_id) REFERENCES public.workshops(id) ON DELETE SET NULL;

-- Update job_cards FK to CASCADE
ALTER TABLE public.job_cards
  DROP CONSTRAINT job_cards_workshop_id_fkey;
ALTER TABLE public.job_cards
  ADD CONSTRAINT job_cards_workshop_id_fkey
  FOREIGN KEY (workshop_id) REFERENCES public.workshops(id) ON DELETE CASCADE;

-- Update user_invites FK to CASCADE
ALTER TABLE public.user_invites
  DROP CONSTRAINT user_invites_workshop_id_fkey;
ALTER TABLE public.user_invites
  ADD CONSTRAINT user_invites_workshop_id_fkey
  FOREIGN KEY (workshop_id) REFERENCES public.workshops(id) ON DELETE CASCADE;