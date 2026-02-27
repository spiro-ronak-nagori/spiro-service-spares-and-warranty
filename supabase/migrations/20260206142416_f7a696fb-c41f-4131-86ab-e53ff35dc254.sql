-- =============================================
-- Spiro Aftersales Service App - Database Schema
-- =============================================

-- Create enum for job card statuses
CREATE TYPE job_card_status AS ENUM (
  'DRAFT',
  'INWARDED',
  'IN_PROGRESS',
  'READY',
  'DELIVERED',
  'CLOSED',
  'REOPENED'
);

-- Create enum for user roles
CREATE TYPE user_role AS ENUM (
  'technician',
  'workshop_admin',
  'super_admin'
);

-- Create enum for workshop types
CREATE TYPE workshop_type AS ENUM (
  'COCO',
  'FOFO'
);

-- Create enum for workshop grades
CREATE TYPE workshop_grade AS ENUM (
  'A',
  'B',
  'C'
);

-- =============================================
-- WORKSHOPS TABLE
-- =============================================
CREATE TABLE public.workshops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type workshop_type NOT NULL DEFAULT 'COCO',
  grade workshop_grade NOT NULL DEFAULT 'B',
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'Nigeria',
  map_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;

-- Everyone can read workshops
CREATE POLICY "Workshops are viewable by authenticated users"
ON public.workshops FOR SELECT
TO authenticated
USING (true);

-- =============================================
-- PROFILES TABLE (linked to auth.users)
-- =============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  workshop_id UUID REFERENCES public.workshops(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'technician',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles (for displaying names)
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =============================================
-- VEHICLES TABLE
-- =============================================
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reg_no TEXT NOT NULL UNIQUE,
  model TEXT,
  color TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  purchase_date DATE,
  last_service_date DATE,
  last_service_odo INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view vehicles
CREATE POLICY "Vehicles are viewable by authenticated users"
ON public.vehicles FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can insert vehicles
CREATE POLICY "Authenticated users can create vehicles"
ON public.vehicles FOR INSERT
TO authenticated
WITH CHECK (true);

-- All authenticated users can update vehicles
CREATE POLICY "Authenticated users can update vehicles"
ON public.vehicles FOR UPDATE
TO authenticated
USING (true);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get current user's profile
CREATE OR REPLACE FUNCTION public.get_user_profile()
RETURNS TABLE (
  profile_id UUID,
  workshop_id UUID,
  role user_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.workshop_id, p.role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

-- Get current user's workshop ID
CREATE OR REPLACE FUNCTION public.get_user_workshop_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workshop_id UUID;
BEGIN
  SELECT p.workshop_id INTO v_workshop_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  RETURN v_workshop_id;
END;
$$;

-- Check if current user is in a specific workshop
CREATE OR REPLACE FUNCTION public.is_user_in_workshop(p_workshop_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.workshop_id = p_workshop_id
  );
END;
$$;

-- =============================================
-- JOB CARDS TABLE
-- =============================================
CREATE TABLE public.job_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jc_number TEXT NOT NULL UNIQUE,
  workshop_id UUID NOT NULL REFERENCES public.workshops(id),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  
  -- Vehicle snapshot at time of JC creation
  odometer INTEGER NOT NULL,
  odometer_photo_url TEXT,
  
  -- Service details
  service_categories TEXT[] NOT NULL DEFAULT '{}',
  issue_categories TEXT[] NOT NULL DEFAULT '{}',
  
  -- Status and workflow
  status job_card_status NOT NULL DEFAULT 'DRAFT',
  
  -- Remarks
  completion_remarks TEXT,
  
  -- OTP tracking
  inwarding_otp_verified BOOLEAN DEFAULT false,
  delivery_otp_verified BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  inwarded_at TIMESTAMP WITH TIME ZONE,
  work_started_at TIMESTAMP WITH TIME ZONE,
  work_completed_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;

-- Users can view job cards from their workshop
CREATE POLICY "Users can view job cards from their workshop"
ON public.job_cards FOR SELECT
TO authenticated
USING (public.is_user_in_workshop(workshop_id));

-- Users can create job cards in their workshop
CREATE POLICY "Users can create job cards in their workshop"
ON public.job_cards FOR INSERT
TO authenticated
WITH CHECK (public.is_user_in_workshop(workshop_id));

-- Users can update job cards in their workshop
CREATE POLICY "Users can update job cards in their workshop"
ON public.job_cards FOR UPDATE
TO authenticated
USING (public.is_user_in_workshop(workshop_id));

-- =============================================
-- AUDIT TRAIL TABLE
-- =============================================
CREATE TABLE public.audit_trail (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_card_id UUID NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  from_status job_card_status,
  to_status job_card_status NOT NULL,
  notes TEXT,
  offline_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- Users can view audit trail for job cards in their workshop
CREATE POLICY "Users can view audit trail for their workshop job cards"
ON public.audit_trail FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.id = job_card_id
    AND public.is_user_in_workshop(jc.workshop_id)
  )
);

-- Users can insert audit trail entries
CREATE POLICY "Users can create audit trail entries"
ON public.audit_trail FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.id = job_card_id
    AND public.is_user_in_workshop(jc.workshop_id)
  )
);

-- =============================================
-- OTP CODES TABLE (for inwarding and delivery verification)
-- =============================================
CREATE TABLE public.otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_card_id UUID NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL, -- 'inwarding' or 'delivery'
  attempts INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Users can manage OTP codes for their workshop job cards
CREATE POLICY "Users can view OTP codes for their workshop job cards"
ON public.otp_codes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.id = job_card_id
    AND public.is_user_in_workshop(jc.workshop_id)
  )
);

CREATE POLICY "Users can create OTP codes"
ON public.otp_codes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.id = job_card_id
    AND public.is_user_in_workshop(jc.workshop_id)
  )
);

CREATE POLICY "Users can update OTP codes"
ON public.otp_codes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_cards jc
    WHERE jc.id = job_card_id
    AND public.is_user_in_workshop(jc.workshop_id)
  )
);

-- =============================================
-- SERVICE CATEGORIES (configurable L1/L2)
-- =============================================
CREATE TABLE public.service_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_code TEXT, -- NULL for L1, parent code for L2
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read service categories
CREATE POLICY "Service categories are viewable by authenticated users"
ON public.service_categories FOR SELECT
TO authenticated
USING (true);

-- Insert default L1 categories
INSERT INTO public.service_categories (code, name, sort_order) VALUES
  ('PM', 'Periodic Maintenance', 1),
  ('BAT', 'Battery', 2),
  ('POW', 'Powertrain/Motor', 3),
  ('BRK', 'Brakes', 4),
  ('CHS', 'Chassis/Suspension', 5),
  ('WHL', 'Wheels', 6),
  ('ELC', 'Electrical/Lights', 7),
  ('ACC', 'Accident/Body', 8),
  ('OTA', 'OTA/Recall', 9);

-- Insert default L2 categories (issues)
INSERT INTO public.service_categories (code, name, parent_code, sort_order) VALUES
  -- Periodic Maintenance
  ('PM_GC', 'General Check-up', 'PM', 1),
  ('PM_LUB', 'Lubrication', 'PM', 2),
  ('PM_FLUID', 'Fluid Top-up', 'PM', 3),
  -- Battery
  ('BAT_CHG', 'Not Charging', 'BAT', 1),
  ('BAT_SWAP', 'Battery Swap Issue', 'BAT', 2),
  ('BAT_CONN', 'Connection Problem', 'BAT', 3),
  -- Powertrain
  ('POW_MOT', 'Motor Noise', 'POW', 1),
  ('POW_PWR', 'Power Loss', 'POW', 2),
  ('POW_CTL', 'Controller Issue', 'POW', 3),
  -- Brakes
  ('BRK_PAD', 'Brake Pads', 'BRK', 1),
  ('BRK_DISC', 'Disc/Drum Issue', 'BRK', 2),
  ('BRK_CABLE', 'Cable Adjustment', 'BRK', 3),
  -- Chassis
  ('CHS_SUSP', 'Suspension', 'CHS', 1),
  ('CHS_FRAME', 'Frame Damage', 'CHS', 2),
  ('CHS_STND', 'Stand Issue', 'CHS', 3),
  -- Wheels
  ('WHL_FLAT', 'Flat Tire', 'WHL', 1),
  ('WHL_ALIGN', 'Alignment', 'WHL', 2),
  ('WHL_BEAR', 'Bearing', 'WHL', 3),
  -- Electrical
  ('ELC_LIGHT', 'Lights Not Working', 'ELC', 1),
  ('ELC_HORN', 'Horn Issue', 'ELC', 2),
  ('ELC_DISP', 'Display Problem', 'ELC', 3),
  -- Accident
  ('ACC_BODY', 'Body Panel Damage', 'ACC', 1),
  ('ACC_PAINT', 'Paint/Scratch', 'ACC', 2),
  -- OTA
  ('OTA_UPD', 'Software Update', 'OTA', 1),
  ('OTA_RCL', 'Recall Campaign', 'OTA', 2);

-- =============================================
-- FUNCTION: Generate JC Number
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_jc_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_date TEXT;
  v_seq INTEGER;
  v_jc_number TEXT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  
  -- Get the next sequence number for today
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(jc_number FROM 10) AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM public.job_cards
  WHERE jc_number LIKE 'JC' || v_date || '%';
  
  v_jc_number := 'JC' || v_date || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_jc_number;
END;
$$;

-- =============================================
-- TRIGGER: Update timestamps
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workshops_updated_at
  BEFORE UPDATE ON public.workshops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_cards_updated_at
  BEFORE UPDATE ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INDEXES for performance
-- =============================================
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_workshop_id ON public.profiles(workshop_id);
CREATE INDEX idx_job_cards_workshop_id ON public.job_cards(workshop_id);
CREATE INDEX idx_job_cards_status ON public.job_cards(status);
CREATE INDEX idx_job_cards_created_at ON public.job_cards(created_at DESC);
CREATE INDEX idx_job_cards_vehicle_id ON public.job_cards(vehicle_id);
CREATE INDEX idx_audit_trail_job_card_id ON public.audit_trail(job_card_id);
CREATE INDEX idx_vehicles_reg_no ON public.vehicles(reg_no);
CREATE INDEX idx_otp_codes_job_card_id ON public.otp_codes(job_card_id);

-- =============================================
-- Insert a test workshop for development
-- =============================================
INSERT INTO public.workshops (id, name, type, grade, city, province, country) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Spiro Lagos Central', 'COCO', 'A', 'Lagos', 'Lagos', 'Nigeria');