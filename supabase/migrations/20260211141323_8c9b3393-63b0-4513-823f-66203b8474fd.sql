
-- Create plate scan audit log table
CREATE TABLE public.plate_scan_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workshop_id UUID NOT NULL,
  country TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'fail')),
  reason TEXT, -- not_a_plate, low_confidence, unreadable, format_invalid, model_error
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plate_scan_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role can insert (edge function uses service role)
CREATE POLICY "Service role can insert plate scan logs"
ON public.plate_scan_audit_log
FOR INSERT
WITH CHECK (true);

-- Workshop users can view their own workshop logs
CREATE POLICY "Workshop users can view plate scan logs"
ON public.plate_scan_audit_log
FOR SELECT
USING (is_user_in_workshop(workshop_id));

-- Elevated admins can view
CREATE POLICY "Elevated admins can view plate scan logs"
ON public.plate_scan_audit_log
FOR SELECT
USING (
  (get_user_role() = 'super_admin'::user_role) OR
  ((get_user_role() = 'country_admin'::user_role) AND
   (EXISTS (SELECT 1 FROM workshops w WHERE w.id = plate_scan_audit_log.workshop_id AND w.country = get_user_country())))
);
