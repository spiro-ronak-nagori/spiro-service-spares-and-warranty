
-- System settings table
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT 'false',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings
CREATE POLICY "Authenticated users can read system settings"
  ON public.system_settings FOR SELECT
  USING (true);

-- Only super_admin can update
CREATE POLICY "Super admins can update system settings"
  ON public.system_settings FOR UPDATE
  USING (get_user_role() = 'super_admin'::user_role);

-- Audit log for setting changes
CREATE TABLE public.system_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view settings audit"
  ON public.system_settings_audit FOR SELECT
  USING (get_user_role() = 'super_admin'::user_role);

CREATE POLICY "Service role can insert settings audit"
  ON public.system_settings_audit FOR INSERT
  WITH CHECK (true);

-- Trigger to auto-log changes
CREATE OR REPLACE FUNCTION public.log_system_setting_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.system_settings_audit (setting_key, old_value, new_value, changed_by)
  VALUES (NEW.key, OLD.value, NEW.value, auth.uid());
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_system_setting_change
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_system_setting_change();

-- Seed initial setting
INSERT INTO public.system_settings (key, value) VALUES ('ENABLE_SMS_TEST_MODE', 'true');
