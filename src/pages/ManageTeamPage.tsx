import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { UserPlus, User, Shield, Mail, AlertTriangle } from 'lucide-react';
import { UserProfile, UserRole } from '@/types';
import { toast } from 'sonner';
import { InviteUserDialog } from '@/components/admin/InviteUserDialog';

interface TeamMember extends UserProfile {
  workshop_name?: string;
}

export default function ManageTeamPage() {
  const { profile, workshop } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';
  const isCountryAdmin = profile?.role === 'country_admin';
  const isElevatedAdmin = isSuperAdmin || isCountryAdmin;

  useEffect(() => {
    if (isElevatedAdmin || workshop?.id) {
      fetchTeam();
    }
  }, [workshop?.id, isElevatedAdmin]);

  const fetchTeam = async () => {
    if (!isElevatedAdmin && !workshop?.id) return;
    setIsLoading(true);

    try {
      // Fetch active team members
      let query = supabase
        .from('profiles')
        .select('*')
        .neq('status', 'REMOVED')
        .order('full_name');

      if (!isElevatedAdmin && workshop?.id) {
        query = query.eq('workshop_id', workshop.id);
      }

      const { data: profileData, error } = await query;
      if (error) throw error;

      // If elevated admin, fetch workshop names for display
      let workshopMap: Record<string, string> = {};
      if (isElevatedAdmin) {
        let wQuery = supabase.from('workshops').select('id, name');
        if (isCountryAdmin && profile?.country) {
          wQuery = wQuery.eq('country', profile.country);
        }
        const { data: workshops } = await wQuery;
        (workshops || []).forEach((w: any) => {
          workshopMap[w.id] = w.name;
        });
      }

      setMembers(
        (profileData || []).map((p: any) => ({
          ...p,
          role: p.role as UserRole,
          status: p.status,
          workshop_name: workshopMap[p.workshop_id] || undefined,
        }))
      );

      // Fetch pending invites
      let inviteQuery = supabase
        .from('user_invites')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (!isElevatedAdmin && workshop?.id) {
        inviteQuery = inviteQuery.eq('workshop_id', workshop.id);
      }

      const { data: inviteData } = await inviteQuery;
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

    const memberWorkshopId = removingMember.workshop_id;
    const reassignToWorkshopId = isElevatedAdmin ? memberWorkshopId : workshop?.id;

    if (!reassignToWorkshopId) return;

    setIsRemoving(true);
    try {
      // 1. Reassign active job cards to the current admin
      const { error: reassignError } = await supabase.rpc(
        'reassign_user_job_cards' as any,
        {
          p_from_user_id: removingMember.id,
          p_to_user_id: profile.id,
          p_workshop_id: reassignToWorkshopId,
        }
      );

      if (reassignError) {
        console.error('Reassignment error:', reassignError);
      }

      // 2. Update profile status to REMOVED
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ status: 'REMOVED' } as any)
        .eq('id', removingMember.id);

      if (updateError) throw updateError;

      toast.success(`${removingMember.full_name} has been removed from the team`);
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
      case 'super_admin': return 'Super Admin';
      case 'country_admin': return 'Country Admin';
      case 'workshop_admin': return 'Admin';
      default: return 'Technician';
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive' as const;
      case 'country_admin': return 'default' as const;
      case 'workshop_admin': return 'default' as const;
      default: return 'secondary' as const;
    }
  };

  const canManageTeam = profile?.role === 'workshop_admin' || profile?.role === 'super_admin' || profile?.role === 'system_admin' || profile?.role === 'country_admin';

  if (!canManageTeam) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/profile" />
        <div className="p-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                You don't have permission to manage the team.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={isElevatedAdmin ? "All Users" : "Manage Team"}
        showBack
        backTo="/profile"
        rightAction={
          <Button size="sm" onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Invite
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Active Members */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Active Members ({members.length})
          </h3>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="mb-3">
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))
          ) : members.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No team members yet</p>
              </CardContent>
            </Card>
          ) : (
            members.map((member) => (
              <Card key={member.id} className="mb-3">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{member.full_name}</p>
                        {isElevatedAdmin && member.workshop_name && (
                          <p className="text-xs text-muted-foreground">{member.workshop_name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={getRoleBadgeVariant(member.role)}>
                            <Shield className="h-3 w-3 mr-1" />
                            {getRoleLabel(member.role)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {member.user_id !== profile?.user_id && member.role !== 'super_admin' && (
                      // Elevated admins can remove non-super-admins; workshop admins can only remove technicians
                      isElevatedAdmin || (member.workshop_id === workshop?.id && member.role !== 'workshop_admin')
                    ) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setRemovingMember(member)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Pending Invites ({pendingInvites.length})
            </h3>
            {pendingInvites.map((invite) => (
              <Card key={invite.id} className="mb-3 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{invite.full_name}</p>
                      <p className="text-sm text-muted-foreground">{invite.email}</p>
                      <Badge variant="outline" className="mt-1">
                        {getRoleLabel(invite.role)} • Pending
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        workshopId={workshop?.id || ''}
        onInvited={fetchTeam}
        allowAdminRole={isElevatedAdmin}
        requireWorkshopSelection={isElevatedAdmin && !workshop?.id}
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
    </AppLayout>
  );
}
