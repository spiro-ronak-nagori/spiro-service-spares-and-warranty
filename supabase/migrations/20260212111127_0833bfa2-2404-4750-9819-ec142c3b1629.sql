
-- Add rider/alternate contact fields to job_cards
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS rider_name text,
  ADD COLUMN IF NOT EXISTS rider_phone text,
  ADD COLUMN IF NOT EXISTS rider_reason text,
  ADD COLUMN IF NOT EXISTS rider_reason_notes text,
  ADD COLUMN IF NOT EXISTS contact_for_updates text NOT NULL DEFAULT 'OWNER',
  ADD COLUMN IF NOT EXISTS rider_phone_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rider_phone_change_reason text;

-- Add constraint for contact_for_updates values
ALTER TABLE public.job_cards
  ADD CONSTRAINT chk_contact_for_updates CHECK (contact_for_updates IN ('OWNER', 'RIDER'));

-- Add constraint for rider_reason values
ALTER TABLE public.job_cards
  ADD CONSTRAINT chk_rider_reason CHECK (rider_reason IS NULL OR rider_reason IN ('RENTED', 'LEASED', 'COMPANY_RIDER', 'FRIEND_OR_FAMILY', 'OTHER'));

-- Insert the new system setting (if not exists)
INSERT INTO public.system_settings (key, value)
VALUES ('ENABLE_ALTERNATE_PHONE_NUMBER', 'false')
ON CONFLICT (key) DO NOTHING;

-- Create audit table for contact changes
CREATE TABLE public.rider_contact_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  contact_for_updates text,
  phone_last4 text,
  rider_reason text,
  rider_phone_change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_contact_audit ENABLE ROW LEVEL SECURITY;

-- RLS: workshop users + elevated admins can insert
CREATE POLICY "Workshop users can insert rider audit"
ON public.rider_contact_audit FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_cards jc
    WHERE jc.id = rider_contact_audit.job_card_id
    AND is_user_in_workshop(jc.workshop_id)
  )
  OR get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (
    SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id
    WHERE jc.id = rider_contact_audit.job_card_id AND w.country = get_user_country()
  ))
);

-- RLS: workshop users + elevated admins can view
CREATE POLICY "Workshop users can view rider audit"
ON public.rider_contact_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM job_cards jc
    WHERE jc.id = rider_contact_audit.job_card_id
    AND is_user_in_workshop(jc.workshop_id)
  )
  OR get_user_role() = 'super_admin'
  OR (get_user_role() = 'country_admin' AND EXISTS (
    SELECT 1 FROM job_cards jc JOIN workshops w ON w.id = jc.workshop_id
    WHERE jc.id = rider_contact_audit.job_card_id AND w.country = get_user_country()
  ))
);
