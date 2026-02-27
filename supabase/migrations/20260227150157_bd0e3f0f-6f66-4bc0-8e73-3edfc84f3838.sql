
-- 1. Add warranty_admin to user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'warranty_admin';
