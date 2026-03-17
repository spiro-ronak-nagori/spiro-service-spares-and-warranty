import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, ShieldCheck, ChevronRight } from 'lucide-react';

export default function ManageAdminsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const isSystemAdmin = profile?.role === 'system_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const hasAccess = isSystemAdmin || isSuperAdmin;

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  const navItems = [
    {
      label: 'Manage Country Admins',
      description: 'Invite and manage country-level administrators',
      icon: Globe,
      path: '/console/country-admins',
      visible: isSystemAdmin || isSuperAdmin,
    },
    {
      label: 'Manage Super Admins',
      description: 'Invite and manage super administrators',
      icon: ShieldCheck,
      path: '/console/super-admins',
      visible: isSystemAdmin,
    },
    {
      label: 'Manage Warranty Admins',
      description: 'Manage warranty admins and their scope assignments',
      icon: ShieldCheck,
      path: '/console/warranty-admins',
      visible: isSystemAdmin || isSuperAdmin,
    },
    {
      label: 'Manage Roles & Permissions',
      description: 'Configure access, scope, and operational permissions',
      icon: ShieldCheck,
      path: '/console/roles',
      visible: isSystemAdmin,
    },
  ];

  return (
    <AppLayout>
      <PageHeader title="Manage Admins" showBack backTo="/console" />
      <div className="p-4 space-y-3">
        {navItems
          .filter((item) => item.visible)
          .map((item) => (
            <Card
              key={item.path}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{item.label}</h3>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
      </div>
    </AppLayout>
  );
}
