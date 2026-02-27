
-- Create countries_master table
CREATE TABLE public.countries_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  iso2 TEXT NOT NULL UNIQUE,
  calling_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.countries_master ENABLE ROW LEVEL SECURITY;

-- Everyone can read active countries (needed for dropdowns, public forms etc.)
CREATE POLICY "Anyone can read active countries"
  ON public.countries_master FOR SELECT
  USING (is_active = true);

-- Only super admins can manage countries
CREATE POLICY "Super admins can manage countries"
  ON public.countries_master FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

-- Seed data
INSERT INTO public.countries_master (name, iso2, calling_code, sort_order) VALUES
  ('Kenya', 'KE', '+254', 1),
  ('Uganda', 'UG', '+256', 2),
  ('Rwanda', 'RW', '+250', 3);
