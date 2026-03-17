import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Shield, Globe, MapPin, Building2, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RoleSummary {
  id: string;
  role_key: string;
  display_name: string;
  description: string | null;
  default_scope: string;
  is_system_managed: boolean;
  updated_at: string;
  enabled_count: number;
  total_count: number;
  override_count: number;
  user_count: number;
}

const SCOPE_ICONS: Record<string, React.ReactNode> = {
  global: <Globe className="h-3.5 w-3.5" />,
  country: <MapPin className="h-3.5 w-3.5" />,
  workshop: <Building2 className="h-3.5 w-3.5" />,
  assignment: <Link2 className="h-3.5 w-3.5" />,
};

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global',
  country: 'Country',
  workshop: 'Workshop',
  assignment: 'Assignment-Scoped',
};

export default function ManageRolesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const isSystemAdmin = profile?.role === 'system_admin';

  useEffect(() => {
    if (!isSystemAdmin) return;
    loadRoles();
  }, [isSystemAdmin]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      // Fetch roles with permission counts
      const { data: rolesData, error: rolesError } = await supabase
        .from('rbac_roles')
        .select('*')
        .order('display_name');

      if (rolesError) throw rolesError;
      if (!rolesData) return;

      // Fetch permission counts per role
      const { data: permData } = await supabase
        .from('rbac_permissions')
        .select('role_id, enabled');

      // Fetch override counts
      const { data: overrideData } = await supabase
        .from('rbac_policy_overrides')
        .select('role_id');

      // Fetch user counts per role
      const { data: userCountData } = await supabase
        .from('profiles')
        .select('role')
        .eq('is_active', true) as any;

      const summaries: RoleSummary[] = rolesData.map((r: any) => {
        const perms = (permData || []).filter((p: any) => p.role_id === r.id);
        const overrides = (overrideData || []).filter((o: any) => o.role_id === r.id);
        const users = (userCountData || []).filter((u: any) => u.role === r.role_key);

        return {
          id: r.id,
          role_key: r.role_key,
          display_name: r.display_name,
          description: r.description,
          default_scope: r.default_scope,
          is_system_managed: r.is_system_managed,
          updated_at: r.updated_at,
          enabled_count: perms.filter((p: any) => p.enabled).length,
          total_count: perms.length,
          override_count: overrides.length,
          user_count: users.length,
        };
      });

      setRoles(summaries);
    } catch (err) {
      console.error('Failed to load roles', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isSystemAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console/admins" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Only System Admin can access this page.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Roles & Permissions" showBack backTo="/console/admins" />
      <div className="p-4 space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          roles.map((role) => (
            <Card
              key={role.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(`/console/roles/${role.role_key}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{role.display_name}</h3>
                      {role.is_system_managed && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">System</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{role.description}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                        {SCOPE_ICONS[role.default_scope]}
                        {SCOPE_LABELS[role.default_scope] || role.default_scope}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {role.enabled_count}/{role.total_count} permissions
                      </Badge>
                      {role.override_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {role.override_count} overrides
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-3" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppLayout>
  );
}
