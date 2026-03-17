-- Insert RBAC permission version marker (idempotent)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('RBAC_PERMISSION_VERSION', '1', now())
ON CONFLICT (key) DO NOTHING;