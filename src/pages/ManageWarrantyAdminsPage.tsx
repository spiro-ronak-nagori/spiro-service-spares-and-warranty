import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { ShieldCheck, Plus, Trash2, Globe, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { WarrantyAdminAssignment, UserProfile, Workshop } from '@/types';

interface AssignmentRow extends WarrantyAdminAssignment {
  admin_profile?: { full_name: string; email: string | null };
  workshop?: { name: string } | null;
  country_name?: string | null;
}

export default function ManageWarrantyAdminsPage() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add dialog state
  const [warrantyAdmins, setWarrantyAdmins] = useState<UserProfile[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [scopeType, setScopeType] = useState<'all' | 'country' | 'workshop'>('all');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [saving, setSaving] = useState(false);

  const isSystemAdmin = profile?.role === 'system_admin';

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('warranty_admin_assignments' as any)
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      const rows = (data || []) as unknown as AssignmentRow[];

      if (rows.length > 0) {
        // Fetch admin profiles
        const userIds = [...new Set(rows.map(r => r.admin_user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

        // Fetch workshops
        const wsIds = rows.filter(r => r.workshop_id).map(r => r.workshop_id!);
        let wsMap = new Map<string, { name: string }>();
        if (wsIds.length > 0) {
          const { data: wsData } = await supabase
            .from('workshops')
            .select('id, name')
            .in('id', wsIds);
          wsMap = new Map((wsData || []).map((w: any) => [w.id, w]));
        }

        // Fetch countries
        const countryIds = rows.filter(r => r.country_id).map(r => r.country_id!);
        let countryMap = new Map<string, string>();
        if (countryIds.length > 0) {
          const { data: cData } = await supabase
            .from('countries_master')
            .select('iso2, name')
            .in('iso2', countryIds);
          countryMap = new Map((cData || []).map((c: any) => [c.iso2, c.name]));
        }

        rows.forEach(r => {
          r.admin_profile = profileMap.get(r.admin_user_id) || { full_name: 'Unknown', email: null };
          r.workshop = r.workshop_id ? wsMap.get(r.workshop_id) || null : null;
          r.country_name = r.country_id ? countryMap.get(r.country_id) || r.country_id : null;
        });
      }

      setAssignments(rows);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddDialog = async () => {
    setShowAdd(true);
    setSelectedAdmin('');
    setScopeType('all');
    setSelectedCountry('');
    setSelectedWorkshop('');

    // Fetch warranty admins and reference data
    const [adminsRes, wsRes, countriesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'warranty_admin').eq('is_active', true),
      supabase.from('workshops').select('id, name, country').order('name'),
      supabase.from('countries_master').select('iso2, name').eq('is_active', true).order('name'),
    ]);

    setWarrantyAdmins((adminsRes.data || []) as unknown as UserProfile[]);
    setWorkshops((wsRes.data || []) as unknown as Workshop[]);
    setCountries((countriesRes.data || []).map((c: any) => ({ id: c.iso2, name: c.name })));
  };

  const handleSave = async () => {
    if (!selectedAdmin || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('warranty_admin_assignments' as any)
        .insert({
          admin_user_id: selectedAdmin,
          country_id: scopeType === 'country' ? selectedCountry : null,
          workshop_id: scopeType === 'workshop' ? selectedWorkshop : null,
          active: true,
          created_by: profile.user_id,
        } as any);

      if (error) throw error;
      toast.success('Assignment created');
      setShowAdd(false);
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await supabase
        .from('warranty_admin_assignments' as any)
        .update({ active: false } as any)
        .eq('id', id);
      toast.success('Assignment removed');
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    }
  };

  if (!isSystemAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground">You don't have permission.</CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Warranty Admin Assignments" showBack />
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Assignment
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : assignments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No warranty admin assignments yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {assignments.map(a => (
              <Card key={a.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.admin_profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.admin_profile?.email || '—'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {a.workshop_id ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Building2 className="h-2.5 w-2.5 mr-0.5" />
                          {a.workshop?.name || a.workshop_id}
                        </Badge>
                      ) : a.country_id ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Globe className="h-2.5 w-2.5 mr-0.5" />
                          {a.country_name || a.country_id}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">All Workshops</Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDeactivate(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Assignment Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Warranty Admin Assignment</DialogTitle>
            <DialogDescription>Assign a warranty admin to a scope (all, country, or workshop).</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Warranty Admin *</Label>
              <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
                <SelectTrigger><SelectValue placeholder="Select admin..." /></SelectTrigger>
                <SelectContent>
                  {warrantyAdmins.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name} ({a.email || a.phone})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {warrantyAdmins.length === 0 && (
                <p className="text-xs text-muted-foreground">No warranty admin users found. Create one first via team management.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workshops</SelectItem>
                  <SelectItem value="country">Specific Country</SelectItem>
                  <SelectItem value="workshop">Specific Workshop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scopeType === 'country' && (
              <div className="space-y-1.5">
                <Label>Country *</Label>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger><SelectValue placeholder="Select country..." /></SelectTrigger>
                  <SelectContent>
                    {countries.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeType === 'workshop' && (
              <div className="space-y-1.5">
                <Label>Workshop *</Label>
                <Select value={selectedWorkshop} onValueChange={setSelectedWorkshop}>
                  <SelectTrigger><SelectValue placeholder="Select workshop..." /></SelectTrigger>
                  <SelectContent>
                    {workshops.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!selectedAdmin || saving || (scopeType === 'country' && !selectedCountry) || (scopeType === 'workshop' && !selectedWorkshop)}
            >
              {saving ? 'Saving...' : 'Save Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
