
-- SMS Audit Log table
CREATE TABLE public.sms_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_card_id UUID REFERENCES public.job_cards(id),
  trigger_status TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  rendered_message TEXT NOT NULL,
  workshop_id UUID REFERENCES public.workshops(id),
  country TEXT,
  username_used TEXT NOT NULL,
  at_response_body JSONB,
  http_status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_audit_log ENABLE ROW LEVEL SECURITY;

-- Super admins can view all SMS logs
CREATE POLICY "Super admins can view SMS logs"
  ON public.sms_audit_log FOR SELECT
  USING (get_user_role() = 'super_admin'::user_role);

-- Workshop users can view SMS logs for their workshop
CREATE POLICY "Workshop users can view SMS logs"
  ON public.sms_audit_log FOR SELECT
  USING (is_user_in_workshop(workshop_id));

-- Insert policy for service role (edge function uses service role)
CREATE POLICY "Service role can insert SMS logs"
  ON public.sms_audit_log FOR INSERT
  WITH CHECK (true);
