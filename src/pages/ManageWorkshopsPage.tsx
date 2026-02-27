import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Building2, Plus, MapPin, Users, Search, X, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { Workshop } from '@/types';
import { toast } from 'sonner';
import { CreateWorkshopDialog } from '@/components/admin/CreateWorkshopDialog';
import { EditWorkshopDialog } from '@/components/admin/EditWorkshopDialog';
import { WorkshopTeamList } from '@/components/admin/WorkshopTeamList';

const COUNTRIES = ['Uganda', 'Kenya', 'Rwanda'];

interface WorkshopWithTeamCount extends Workshop {
  teamCount?: number;
}

export default function ManageWorkshopsPage() {
  const { profile } = useAuth();
  const [workshops, setWorkshops] = useState<WorkshopWithTeamCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [expandedWorkshop, setExpandedWorkshop] = useState<string | null>(null);
  const [editingWorkshop, setEditingWorkshop] = useState<WorkshopWithTeamCount | null>(null);
  const [deletingWorkshop, setDeletingWorkshop] = useState<WorkshopWithTeamCount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';
  const isCountryAdmin = profile?.role === 'country_admin';
  const hasAccess = isSuperAdmin || isCountryAdmin;

  useEffect(() => {
    if (hasAccess) fetchWorkshops();
  }, [hasAccess]);

  const fetchWorkshops = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('workshops').select('*').order('name');
      if (isCountryAdmin && profile?.country) {
        query = query.eq('country', profile.country);
      }
      const { data, error } = await query;
      if (error) throw error;

      const typedWorkshops = (data || []).map((w: any) => ({
        ...w,
        type: w.type as Workshop['type'],
        grade: w.grade as Workshop['grade'],
      }));

      const { data: profileCounts } = await supabase
        .from('profiles')
        .select('workshop_id')
        .neq('status', 'REMOVED');

      const countMap: Record<string, number> = {};
      (profileCounts || []).forEach((p: any) => {
        if (p.workshop_id) {
          countMap[p.workshop_id] = (countMap[p.workshop_id] || 0) + 1;
        }
      });

      setWorkshops(
        typedWorkshops.map((w) => ({ ...w, teamCount: countMap[w.id] || 0 }))
      );
    } catch (error) {
      console.error('Error fetching workshops:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWorkshop = async () => {
    if (!deletingWorkshop) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('workshops').delete().eq('id', deletingWorkshop.id);
      if (error) throw error;
      toast.success(`${deletingWorkshop.name} deleted`);
      setDeletingWorkshop(null);
      setExpandedWorkshop(null);
      fetchWorkshops();
    } catch (error: any) {
      const msg = error.message?.includes('foreign key')
        ? 'Cannot delete workshop with existing team members or job cards. Remove them first.'
        : error.message || 'Failed to delete workshop';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredWorkshops = workshops.filter((w) => {
    if (countryFilter && countryFilter !== 'all' && w.country !== countryFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return w.name.toLowerCase().includes(q) || w.city?.toLowerCase().includes(q) || w.province?.toLowerCase().includes(q);
  });

  // Group by country
  const grouped: Record<string, WorkshopWithTeamCount[]> = {};
  filteredWorkshops.forEach((w) => {
    const c = w.country || 'Unassigned';
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(w);
  });
  const sortedCountries = Object.keys(grouped).sort();

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">You don't have permission.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Manage Workshops"
        showBack
        backTo="/console"
        rightAction={
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Workshop
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search workshops..."
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
          {isSuperAdmin && (
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
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {filteredWorkshops.length} workshop{filteredWorkshops.length !== 1 ? 's' : ''}
        </p>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
          ))
        ) : filteredWorkshops.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{searchQuery ? 'No matching workshops' : 'No workshops yet'}</p>
              {!searchQuery && (
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />Create Workshop
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          sortedCountries.map((country) => (
            <div key={country} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 pt-2">
                <MapPin className="h-3 w-3" />
                {country} ({grouped[country].length})
              </p>
              {grouped[country].map((workshop) => (
                <Collapsible
                  key={workshop.id}
                  open={expandedWorkshop === workshop.id}
                  onOpenChange={(open) => setExpandedWorkshop(open ? workshop.id : null)}
                >
                  <Card>
                    <CardContent className="p-4">
                      <CollapsibleTrigger className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <h3 className="font-semibold truncate">{workshop.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">
                                {[workshop.city, workshop.province].filter(Boolean).join(', ') || 'No location'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{workshop.type}</Badge>
                              <Badge variant="secondary">Grade {workshop.grade}</Badge>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />{workshop.teamCount}
                              </div>
                            </div>
                          </div>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 mt-1 ${expandedWorkshop === workshop.id ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pt-3 border-t mt-3 flex justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setDeletingWorkshop(workshop); }}>
                            <Trash2 className="h-3 w-3 mr-1" />Delete
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setEditingWorkshop(workshop); }}>
                            <Pencil className="h-3 w-3 mr-1" />Edit Details
                          </Button>
                        </div>
                        <WorkshopTeamList workshopId={workshop.id} workshopName={workshop.name} />
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ))
        )}
      </div>

      <CreateWorkshopDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onCreated={fetchWorkshops} />
      {editingWorkshop && (
        <EditWorkshopDialog open={!!editingWorkshop} onOpenChange={(open) => !open && setEditingWorkshop(null)} workshop={editingWorkshop} onUpdated={fetchWorkshops} />
      )}
      <ConfirmationDialog
        open={!!deletingWorkshop}
        onOpenChange={(open) => !open && setDeletingWorkshop(null)}
        title="Delete Workshop"
        description={deletingWorkshop ? `Are you sure you want to delete "${deletingWorkshop.name}"? This action cannot be undone.` : ''}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Workshop'}
        variant="destructive"
        onConfirm={handleDeleteWorkshop}
      />
    </AppLayout>
  );
}
