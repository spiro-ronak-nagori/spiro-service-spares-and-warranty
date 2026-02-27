import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { ShieldCheck, User, Mail, MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface SuperAdmin {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface PendingInvite {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface SuperAdminsListProps {
  refreshKey?: number;
  searchQuery?: string;
}

export function SuperAdminsList({ refreshKey, searchQuery }: SuperAdminsListProps) {
  const [admins, setAdmins] = useState<SuperAdmin[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingAdmin, setRemovingAdmin] = useState<SuperAdmin | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [cancellingInvite, setCancellingInvite] = useState<PendingInvite | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    fetchSuperAdmins();
  }, [refreshKey]);

  const fetchSuperAdmins = async () => {
    setIsLoading(true);
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, phone, status')
        .eq('role', 'super_admin' as any)
        .neq('status', 'REMOVED')
        .order('full_name');

      if (error) throw error;
      setAdmins(profileData || []);

      const { data: inviteData } = await supabase
        .from('user_invites')
        .select('id, full_name, email, phone')
        .eq('role', 'super_admin' as any)
        .eq('status', 'PENDING')
        .order('full_name');

      setPendingInvites(inviteData || []);
    } catch (error) {
      console.error('Error fetching super admins:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!removingAdmin) return;
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'REMOVED' } as any)
        .eq('id', removingAdmin.id);

      if (error) throw error;
      toast.success(`${removingAdmin.full_name} has been removed`);
      setRemovingAdmin(null);
      fetchSuperAdmins();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCancelInvite = async () => {
    if (!cancellingInvite) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('user_invites')
        .delete()
        .eq('id', cancellingInvite.id);

      if (error) throw error;
      toast.success(`Invite for ${cancellingInvite.full_name} cancelled`);
      setCancellingInvite(null);
      fetchSuperAdmins();
    } catch (error: any) {
      toast.error('Failed to cancel invite');
    } finally {
      setIsCancelling(false);
    }
  };

  const filterBySearch = (name: string) => {
    if (!searchQuery) return true;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const filteredAdmins = admins.filter((a) => filterBySearch(a.full_name));
  const filteredInvites = pendingInvites.filter((inv) => filterBySearch(inv.full_name));

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (filteredAdmins.length === 0 && filteredInvites.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No Super Admins yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {filteredAdmins.map((admin) => (
        <Card key={admin.id}>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{admin.full_name}</p>
                {(admin.email || admin.phone) && (
                  <p className="text-xs text-muted-foreground truncate">{admin.email || admin.phone}</p>
                )}
                <Badge variant="default" className="text-[10px] h-4 px-1.5">
                  Super Admin
                </Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => setRemovingAdmin(admin)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      ))}

      {filteredInvites.map((invite) => (
        <Card key={invite.id} className="border-dashed">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted flex-shrink-0">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{invite.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{invite.email || invite.phone}</p>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 mt-0.5">
                  Pending
                </Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => setCancellingInvite(invite)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Cancel Invite
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      ))}

      <ConfirmationDialog
        open={!!removingAdmin}
        onOpenChange={(open) => !open && setRemovingAdmin(null)}
        title="Remove Super Admin"
        description={removingAdmin ? `Are you sure you want to remove ${removingAdmin.full_name} as Super Admin?` : ''}
        confirmLabel={isRemoving ? 'Removing...' : 'Remove'}
        variant="destructive"
        onConfirm={handleRemoveAdmin}
      />

      <ConfirmationDialog
        open={!!cancellingInvite}
        onOpenChange={(open) => !open && setCancellingInvite(null)}
        title="Cancel Invite"
        description={cancellingInvite ? `Cancel the pending invite for ${cancellingInvite.full_name}?` : ''}
        confirmLabel={isCancelling ? 'Cancelling...' : 'Cancel Invite'}
        variant="destructive"
        onConfirm={handleCancelInvite}
      />
    </div>
  );
}
