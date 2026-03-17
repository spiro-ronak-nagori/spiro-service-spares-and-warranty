import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { LogOut, Building2, Phone, Mail, Shield, Edit, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function ProfilePage() {
  const { profile, workshop, signOut } = useAuth();
  const navigate = useNavigate();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/auth');
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'system_admin': return 'destructive';
      case 'super_admin': return 'destructive';
      case 'country_admin': return 'default';
      case 'workshop_admin': return 'default';
      case 'warranty_admin': return 'default';
      case 'spares_manager': return 'default';
      default: return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'system_admin': return 'System Admin';
      case 'super_admin': return 'Super Admin';
      case 'country_admin': return 'Country Admin';
      case 'workshop_admin': return 'Workshop Admin';
      case 'warranty_admin': return 'Warranty Admin';
      default: return 'Technician';
    }
  };

  const canManageTeam = profile?.role === 'workshop_admin' || profile?.role === 'super_admin' || profile?.role === 'country_admin' || profile?.role === 'system_admin';

  // Fetch warranty admin assignments with resolved workshop names
  const { data: warrantyAssignments } = useQuery({
    queryKey: ['warranty-admin-assignments-profile', profile?.id],
    enabled: profile?.role === 'warranty_admin',
    queryFn: async () => {
      // Get assignments
      const { data: assignments, error } = await supabase
        .from('warranty_admin_assignments')
        .select('id, country_ids, workshop_ids, active')
        .eq('admin_user_id', profile!.user_id)
        .eq('active', true);
      if (error) throw error;
      if (!assignments?.length) return [];

      // Collect all workshop IDs and country codes
      const allWorkshopIds = assignments.flatMap(a => a.workshop_ids || []);
      const allCountryIds = assignments.flatMap(a => a.country_ids || []);

      // Fetch workshop names for explicit IDs
      let workshopMap: Record<string, string> = {};
      if (allWorkshopIds.length > 0) {
        const { data: ws } = await supabase
          .from('workshops')
          .select('id, name')
          .in('id', allWorkshopIds);
        ws?.forEach(w => { workshopMap[w.id] = w.name; });
      }

      // For country-scoped assignments (empty workshop_ids), fetch all workshops in those countries
      const countryOnlyAssignments = assignments.filter(a => (!a.workshop_ids || a.workshop_ids.length === 0) && a.country_ids && a.country_ids.length > 0);
      let countryWorkshops: { name: string; country: string }[] = [];
      if (countryOnlyAssignments.length > 0) {
        const iso2Codes = [...new Set(countryOnlyAssignments.flatMap(a => a.country_ids || []))];
        // Resolve ISO2 codes to full country names via countries_master
        const { data: countryRows } = await supabase
          .from('countries_master')
          .select('name')
          .in('iso2', iso2Codes);
        const countryNames = (countryRows || []).map(c => c.name);
        if (countryNames.length > 0) {
          const { data: ws } = await supabase
            .from('workshops')
            .select('name, country')
            .in('country', countryNames);
          countryWorkshops = ws || [];
        }
      }

      // For global assignments (both empty), fetch all workshops
      const globalAssignments = assignments.filter(a => (!a.workshop_ids || a.workshop_ids.length === 0) && (!a.country_ids || a.country_ids.length === 0));
      let globalWorkshops: { name: string }[] = [];
      if (globalAssignments.length > 0) {
        const { data: ws } = await supabase
          .from('workshops')
          .select('name');
        globalWorkshops = ws || [];
      }

      // Build resolved list
      const resolvedWorkshops: string[] = [];

      // Add explicitly assigned workshops
      allWorkshopIds.forEach(id => {
        if (workshopMap[id] && !resolvedWorkshops.includes(workshopMap[id])) {
          resolvedWorkshops.push(workshopMap[id]);
        }
      });

      // Add country-scoped workshops
      countryWorkshops.forEach(w => {
        if (!resolvedWorkshops.includes(w.name)) {
          resolvedWorkshops.push(w.name);
        }
      });

      // Add global workshops
      globalWorkshops.forEach(w => {
        if (!resolvedWorkshops.includes(w.name)) {
          resolvedWorkshops.push(w.name);
        }
      });

      return resolvedWorkshops;
    },
  });

  return (
    <AppLayout>
      <PageHeader 
        title="Profile" 
        rightAction={
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile/edit')}>
            <Edit className="h-5 w-5" />
          </Button>
        }
      />
      
      <div className="p-4 space-y-4">
        {/* User Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between gap-3 items-start">
              {/* Left: name + contact */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate">{profile?.full_name || 'User'}</CardTitle>
                {(() => {
                  const isDummy = (e?: string | null) => !!e && e.endsWith('@phone.spironet.local');
                  if (profile?.phone) {
                    return (
                      <CardDescription className="flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{profile.phone}</span>
                      </CardDescription>
                    );
                  }
                  if (profile?.email && !isDummy(profile.email)) {
                    return (
                      <CardDescription className="flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{profile.email}</span>
                      </CardDescription>
                    );
                  }
                  return null;
                })()}
              </div>
              {/* Right: role badge */}
              {profile?.role && (
                <Badge
                  variant={getRoleBadgeVariant(profile.role)}
                  className="flex-shrink-0 max-w-[40%] whitespace-normal break-words text-right"
                >
                  <Shield className="h-3 w-3 mr-1 flex-shrink-0" />
                  {getRoleLabel(profile.role)}
                </Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Workshop Info Card */}
        {workshop && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Building2 className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Workshop</CardTitle>
                  <CardDescription>{workshop.name}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">{workshop.type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Grade</span>
                  <p className="font-medium">{workshop.grade}</p>
                </div>
                {workshop.city && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Location</span>
                    <p className="font-medium">
                      {[workshop.city, workshop.province, workshop.country]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warranty Admin Assigned Workshops */}
        {profile?.role === 'warranty_admin' && warrantyAssignments && warrantyAssignments.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Building2 className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Assigned Workshops</CardTitle>
                  <CardDescription>{warrantyAssignments.length} workshop{warrantyAssignments.length !== 1 ? 's' : ''}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {warrantyAssignments.map((name) => (
                  <Badge key={name} variant="secondary">{name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!workshop && profile?.role !== 'super_admin' && profile?.role !== 'country_admin' && profile?.role !== 'warranty_admin' && (
          <Card>
            <CardContent className="py-8 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No workshop assigned</p>
              <p className="text-sm text-muted-foreground mt-1">
                Contact your administrator to get assigned to a workshop
              </p>
            </CardContent>
          </Card>
        )}

        {profile?.role === 'country_admin' && profile?.country && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Building2 className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Country</CardTitle>
                  <CardDescription>{profile.country}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Manage Team - visible only to Admins and Super Admins */}
        {canManageTeam && (
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigate('/manage-team')}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Manage Team</p>
                    <p className="text-sm text-muted-foreground">
                      Invite or remove team members
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Sign Out */}
        <Button
          variant="outline"
          className="w-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowSignOutConfirm(true)}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <ConfirmationDialog
        open={showSignOutConfirm}
        onOpenChange={setShowSignOutConfirm}
        title="Sign Out"
        description="Are you sure you want to sign out? You'll need to sign in again to access your account."
        confirmLabel="Sign Out"
        variant="destructive"
        onConfirm={handleSignOut}
      />
    </AppLayout>
  );
}
