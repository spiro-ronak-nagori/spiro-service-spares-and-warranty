
-- Migration 1/2: Add system_admin enum value only
-- (Enum value must be committed before it can be used in functions/policies)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'system_admin';
