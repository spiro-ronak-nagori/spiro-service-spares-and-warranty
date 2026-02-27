
-- Add code_hash column for storing hashed OTP (plain code column will be deprecated)
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS code_hash text;
