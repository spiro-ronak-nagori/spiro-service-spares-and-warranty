import { ReactNode } from 'react';
import { BottomNavigation } from './BottomNavigation';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Main content area with bottom padding for navigation */}
      <main className="flex-1 pb-20">
        {children}
      </main>
      
      {/* Bottom navigation */}
      <BottomNavigation />
    </div>
  );
}
