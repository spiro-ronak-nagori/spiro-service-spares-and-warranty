-- Allow super admins to update any job card
CREATE POLICY "Super admins can update any job card"
ON public.job_cards
FOR UPDATE
USING (get_user_role() = 'super_admin'::user_role);

-- Allow super admins to create audit trail entries for any job card
CREATE POLICY "Super admins can create audit trail entries"
ON public.audit_trail
FOR INSERT
WITH CHECK (get_user_role() = 'super_admin'::user_role);

-- Allow super admins to create OTP codes for any job card
CREATE POLICY "Super admins can create OTP codes"
ON public.otp_codes
FOR INSERT
WITH CHECK (get_user_role() = 'super_admin'::user_role);

-- Allow super admins to view OTP codes for any job card
CREATE POLICY "Super admins can view OTP codes"
ON public.otp_codes
FOR SELECT
USING (get_user_role() = 'super_admin'::user_role);

-- Allow super admins to update OTP codes for any job card
CREATE POLICY "Super admins can update OTP codes"
ON public.otp_codes
FOR UPDATE
USING (get_user_role() = 'super_admin'::user_role);