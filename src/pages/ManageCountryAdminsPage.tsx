import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, X, Globe } from 'lucide-react';
import { CountryAdminsList } from '@/components/admin/CountryAdminsList';
import { InviteCountryAdminDialog } from '@/components/admin/InviteCountryAdminDialog';

const COUNTRIES = ['Uganda', 'Kenya', 'Rwanda'];

export default function ManageCountryAdminsPage() {
  const { profile } = useAuth();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');

  const isSuperAdmin = profile?.role === 'super_admin';
  const isSystemAdmin = profile?.role === 'system_admin';
  const hasAccess = isSuperAdmin || isSystemAdmin;

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Super Admin access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Manage Country Admins"
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
        <div className="flex gap-2">
          <div className="relative flex-1">
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
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-[130px] h-11">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CountryAdminsList refreshKey={refreshKey} searchQuery={searchQuery} countryFilter={countryFilter === 'all' ? undefined : countryFilter} />
      </div>

      <InviteCountryAdminDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </AppLayout>
  );
}
