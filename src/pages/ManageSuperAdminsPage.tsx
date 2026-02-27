import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, X } from 'lucide-react';
import { SuperAdminsList } from '@/components/admin/SuperAdminsList';
import { InviteSuperAdminDialog } from '@/components/admin/InviteSuperAdminDialog';

export default function ManageSuperAdminsPage() {
  const { profile } = useAuth();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const isSystemAdmin = profile?.role === 'system_admin';

  if (!isSystemAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">System Admin access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Manage Super Admins"
        showBack
        backTo="/console"
        rightAction={
          <Button size="sm" onClick={() => setShowInviteDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        }
      />
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-8 h-11"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <SuperAdminsList refreshKey={refreshKey} searchQuery={searchQuery} />
      </div>

      <InviteSuperAdminDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </AppLayout>
  );
}
