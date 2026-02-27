-- Fix function search paths and tighten vehicle RLS policies

-- Fix generate_jc_number function
CREATE OR REPLACE FUNCTION public.generate_jc_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop and recreate vehicle policies with proper restrictions
-- Vehicles should be viewable by authenticated users (needed for lookups)
-- But insert/update should be restricted to users in a workshop

DROP POLICY IF EXISTS "Authenticated users can create vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can update vehicles" ON public.vehicles;

-- Users can insert vehicles if they have a workshop assignment
CREATE POLICY "Workshop users can create vehicles"
ON public.vehicles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.workshop_id IS NOT NULL
  )
);

-- Users can update vehicles if they have a workshop assignment
CREATE POLICY "Workshop users can update vehicles"
ON public.vehicles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.workshop_id IS NOT NULL
  )
);