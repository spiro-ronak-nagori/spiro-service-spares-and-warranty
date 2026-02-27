
-- Fix: restrict audit insert to the trigger function only (no direct user inserts)
DROP POLICY "Service role can insert settings audit" ON public.system_settings_audit;

-- No INSERT policy needed — the trigger function uses SECURITY DEFINER
-- which bypasses RLS. Users cannot insert directly.
