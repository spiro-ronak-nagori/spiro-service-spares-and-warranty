import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { User, Shield, Mail, UserPlus } from 'lucide-react';
import { UserProfile, UserRole } from '@/types';
import { toast } from 'sonner';
import { InviteUserDialog } from './InviteUserDialog';

interface TeamMember extends UserProfile {
}

interface WorkshopTeamListProps {
  workshopId: string;
  workshopName: string;
}

export function WorkshopTeamList({ workshopId, workshopName }: WorkshopTeamListProps) {
  const { profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [cancellingInvite, setCancellingInvite] = useState<any | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    fetchTeam();
  }, [workshopId]);

  const fetchTeam = async () => {
    setIsLoading(true);
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('workshop_id', workshopId)
        .neq('status', 'REMOVED')
        .order('full_name');

      if (error) throw error;

      setMembers(
        (profileData || []).map((p: any) => ({
          ...p,
          role: p.role as UserRole,
          status: p.status,
        }))
      );

      const { data: inviteData } = await supabase
        .from('user_invites')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      setPendingInvites(inviteData || []);
    } catch (error) {
      console.error('Error fetching team:', error);
      toast.error('Failed to load team');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMember || !profile) return;
    setIsRemoving(true);
    try {
      const { error: reassignError } = await supabase.rpc(
        'reassign_user_job_cards' as any,
        {
          p_from_user_id: removingMember.id,
          p_to_user_id: profile.id,
          p_workshop_id: workshopId,
        }
      );
      if (reassignError) console.error('Reassignment error:', reassignError);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ status: 'REMOVED' } as any)
        .eq('id', removingMember.id);

      if (updateError) throw updateError;

      toast.success(`${removingMember.full_name} has been removed`);
      setRemovingMember(null);
      fetchTeam();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove team member');
    } finally {
      setIsRemoving(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'system_admin': return 'System Admin';
      case 'super_admin': return 'Super Admin';
      case 'country_admin': return 'Country Admin';
      case 'workshop_admin': return 'Admin';
      case 'warranty_admin': return 'Warranty Admin';
      case 'spares_manager': return 'Spares Manager';
      case 'technician': return 'Technician';
      default: return role;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'system_admin': return 'destructive' as const;
      case 'super_admin': return 'destructive' as const;
      case 'country_admin': return 'default' as const;
      case 'workshop_admin': return 'default' as const;
      case 'warranty_admin': return 'default' as const;
      case 'spares_manager': return 'default' as const;
      default: return 'secondary' as const;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="pt-3 border-t space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Team ({members.length})
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowInviteDialog(true)}>
          <UserPlus className="h-3 w-3 mr-1" />
          Invite
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No team members</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{member.full_name}</p>
                  <Badge variant={getRoleBadgeVariant(member.role)} className="text-[10px] h-4 px-1.5">
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    {getRoleLabel(member.role)}
                  </Badge>
                </div>
              </div>
              {member.user_id !== profile?.user_id && member.role !== 'super_admin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setRemovingMember(member)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pending ({pendingInvites.length})
          </p>
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted flex-shrink-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{invite.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{invite.email || invite.phone}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                onClick={() => setCancellingInvite(invite)}
              >
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}

      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        workshopId={workshopId}
        onInvited={fetchTeam}
        allowAdminRole={true}
      />

      <ConfirmationDialog
        open={!!removingMember}
        onOpenChange={(open) => !open && setRemovingMember(null)}
        title="Remove Team Member"
        description={
          removingMember
            ? `Are you sure you want to remove ${removingMember.full_name}? Any active job cards assigned to them will be reassigned to you.`
            : ''
        }
        confirmLabel={isRemoving ? 'Removing...' : 'Remove Member'}
        variant="destructive"
        onConfirm={handleRemoveMember}
      />

      <ConfirmationDialog
        open={!!cancellingInvite}
        onOpenChange={(open) => !open && setCancellingInvite(null)}
        title="Cancel Invite"
        description={
          cancellingInvite
            ? `Cancel the pending invite for ${cancellingInvite.full_name} (${cancellingInvite.email})?`
            : ''
        }
        confirmLabel={isCancelling ? 'Cancelling...' : 'Cancel Invite'}
        variant="destructive"
        onConfirm={async () => {
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
            fetchTeam();
          } catch (error: any) {
            console.error('Error cancelling invite:', error);
            toast.error('Failed to cancel invite');
          } finally {
            setIsCancelling(false);
          }
        }}
      />
    </div>
  );
}
