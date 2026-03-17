import { useAuth } from '@/contexts/AuthContext';
import { useRbacPermissions } from '@/hooks/useRbacPermissions';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ListTree, ClipboardList, Package, ClipboardCheck, ChevronRight, ToggleLeft, Wrench } from 'lucide-react';

export default function SystemConfigPage() {
  const { profile } = useAuth();
  const { can } = useRbacPermissions();
  const navigate = useNavigate();

  const hasAccess = can('config.view');

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
      label: 'Manage Toggles',
      description: 'Configure feature toggles and SLA settings country-wise',
      icon: ToggleLeft,
      path: '/console/manage-toggles',
    },
    {
      label: 'Manage Service Categories',
      description: 'Add, edit, and remove service categories and issues',
      icon: ListTree,
      path: '/console/service-categories',
    },
    {
      label: 'Manage Feedback Form',
      description: 'Edit questions, types, and ordering',
      icon: ClipboardList,
      path: '/console/feedback-editor',
    },
    {
      label: 'Manage Spare Parts',
      description: 'Spare parts master list and vehicle model mappings',
      icon: Package,
      path: '/console/spare-parts',
    },
    {
      label: 'Manage Vehicle Checklist',
      description: 'Configure intake checklist templates and items',
      icon: ClipboardCheck,
      path: '/console/vehicle-checklist',
    },
  ];

  return (
    <AppLayout>
      <PageHeader title="System Configuration" showBack backTo="/console" />
      <div className="p-4 space-y-4">
        {navItems.map((item) => (
          <Card key={item.path} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(item.path)}>
            <CardContent className="p-4 flex items-center gap-4">
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium">{item.label}</h3>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
