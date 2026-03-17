
-- 1. Add spares_manager to the user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'spares_manager';

-- 2. Scope type enum
CREATE TYPE public.rbac_scope_type AS ENUM ('global', 'country', 'workshop', 'assignment');

-- 3. Policy overlay enum
CREATE TYPE public.rbac_policy_type AS ENUM ('DEFAULT', 'COCO', 'FOFO');

-- 4. Permission group enum
CREATE TYPE public.rbac_permission_group AS ENUM (
  'NAVIGATION',
  'JOB_CARDS',
  'SPARES_MANAGEMENT',
  'WARRANTY',
  'REPORTS',
  'USERS_TEAM',
  'MASTERS_CONFIG',
  'PROFILE_SELF'
);

-- 5. Main role definitions table
CREATE TABLE public.rbac_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key public.user_role NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  default_scope public.rbac_scope_type NOT NULL DEFAULT 'workshop',
  is_system_managed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage rbac_roles"
  ON public.rbac_roles FOR ALL TO authenticated
  USING (public.get_user_role() = 'system_admin')
  WITH CHECK (public.get_user_role() = 'system_admin');

CREATE POLICY "Authenticated can read rbac_roles"
  ON public.rbac_roles FOR SELECT TO authenticated
  USING (true);

-- 6. Permissions table: per role, per permission key
CREATE TABLE public.rbac_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  permission_group public.rbac_permission_group NOT NULL,
  permission_key text NOT NULL,
  display_label text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_key)
);

ALTER TABLE public.rbac_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage rbac_permissions"
  ON public.rbac_permissions FOR ALL TO authenticated
  USING (public.get_user_role() = 'system_admin')
  WITH CHECK (public.get_user_role() = 'system_admin');

CREATE POLICY "Authenticated can read rbac_permissions"
  ON public.rbac_permissions FOR SELECT TO authenticated
  USING (true);

-- 7. Policy overrides: per role + policy type, override specific permissions
CREATE TABLE public.rbac_policy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  policy_type public.rbac_policy_type NOT NULL,
  permission_key text NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, policy_type, permission_key)
);

ALTER TABLE public.rbac_policy_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage rbac_policy_overrides"
  ON public.rbac_policy_overrides FOR ALL TO authenticated
  USING (public.get_user_role() = 'system_admin')
  WITH CHECK (public.get_user_role() = 'system_admin');

CREATE POLICY "Authenticated can read rbac_policy_overrides"
  ON public.rbac_policy_overrides FOR SELECT TO authenticated
  USING (true);

-- 8. RBAC audit log
CREATE TABLE public.rbac_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_role text,
  target_user_id uuid,
  changed_field text,
  old_value text,
  new_value text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage rbac_audit_log"
  ON public.rbac_audit_log FOR ALL TO authenticated
  USING (public.get_user_role() = 'system_admin')
  WITH CHECK (public.get_user_role() = 'system_admin');

-- 9. Triggers for updated_at
CREATE TRIGGER update_rbac_roles_updated_at
  BEFORE UPDATE ON public.rbac_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rbac_permissions_updated_at
  BEFORE UPDATE ON public.rbac_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rbac_policy_overrides_updated_at
  BEFORE UPDATE ON public.rbac_policy_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
