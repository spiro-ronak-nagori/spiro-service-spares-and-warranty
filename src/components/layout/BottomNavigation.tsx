import { NavLink, useLocation } from 'react-router-dom';
import { FileText, PlusCircle, BarChart3, User, Settings2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useRbacPermissions } from '@/hooks/useRbacPermissions';

export function BottomNavigation() {
  const location = useLocation();
  const { profile } = useAuth();
  const { can, isLoading: rbacLoading } = useRbacPermissions();

  const navItems = (() => {
    const items: { to: string; icon: typeof FileText; label: string }[] = [];

    // While RBAC is loading, show minimal nav to avoid flash
    if (rbacLoading) {
      items.push({ to: '/', icon: FileText, label: 'Job Cards' });
      items.push({ to: '/profile', icon: User, label: 'Profile' });
      return items;
    }

    // Warranty admin dedicated nav
    if ((profile?.role as string) === 'warranty_admin') {
      if (can('nav.warranty_approvals')) {
        items.push({ to: '/warranty-approvals', icon: ShieldCheck, label: 'Approvals' });
      }
      items.push({ to: '/profile', icon: User, label: 'Profile' });
      return items;
    }

    // Console (for roles that have nav.console)
    if (can('nav.console')) {
      items.push({ to: '/console', icon: Settings2, label: 'Console' });
    }

    // Job Cards
    if (can('nav.job_cards')) {
      items.push({ to: '/', icon: FileText, label: 'Job Cards' });
    }

    // Create JC — only show for non-admin roles that have permission
    if (can('nav.create_job_card') && !can('nav.console')) {
      items.push({ to: '/create', icon: PlusCircle, label: 'Create JC' });
    }

    // Reports
    if (can('nav.reports')) {
      items.push({ to: '/reports', icon: BarChart3, label: 'Reports' });
    }

    // Warranty Approvals tab (for non-warranty_admin roles that have it)
    if (can('nav.warranty_approvals') && (profile?.role as string) !== 'warranty_admin') {
      items.push({ to: '/warranty-approvals', icon: ShieldCheck, label: 'Approvals' });
    }

    // Profile always visible
    items.push({ to: '/profile', icon: User, label: 'Profile' });

    return items;
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to === '/' && location.pathname.startsWith('/job-card/'));

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 px-2 text-xs font-medium transition-colors py-[6px]',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-6 w-6', isActive && 'text-primary')} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
