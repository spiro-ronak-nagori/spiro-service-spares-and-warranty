import { NavLink, useLocation } from 'react-router-dom';
import { FileText, PlusCircle, BarChart3, User, Settings2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function BottomNavigation() {
  const location = useLocation();
  const { profile } = useAuth();

  const role = profile?.role;

  const navItems = (() => {
    const items: {to: string;icon: typeof FileText;label: string;}[] = [];

    // Warranty admin gets a dedicated nav
    if (role === 'warranty_admin') {
      items.push({ to: '/warranty-approvals', icon: ShieldCheck, label: 'Approvals' });
      items.push({ to: '/profile', icon: User, label: 'Profile' });
      return items;
    }

    if (role === 'super_admin' || role === 'country_admin' || role === 'system_admin') {
      items.push({ to: '/console', icon: Settings2, label: 'Console' });
    }

    items.push({ to: '/', icon: FileText, label: 'Job Cards' });

    if (role !== 'super_admin' && role !== 'country_admin' && role !== 'system_admin') {
      items.push({ to: '/create', icon: PlusCircle, label: 'Create JC' });
    }

    if (role === 'super_admin' || role === 'country_admin' || role === 'system_admin') {
      items.push({ to: '/reports', icon: BarChart3, label: 'Reports' });
    }

    items.push({ to: '/profile', icon: User, label: 'Profile' });

    return items;
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
          item.to === '/' && location.pathname.startsWith('/job-card/');

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn("flex flex-1 flex-col items-center gap-1 px-2 text-xs font-medium transition-colors py-[6px]",

              isActive ?
              'text-primary' :
              'text-muted-foreground hover:text-foreground'
              )}>
              
              <item.icon
                className={cn(
                  'h-6 w-6',
                  isActive && 'text-primary'
                )} />
              
              <span>{item.label}</span>
            </NavLink>);

        })}
      </div>
    </nav>);

}