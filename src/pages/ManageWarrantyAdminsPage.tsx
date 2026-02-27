import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { ShieldCheck, Plus, Trash2, Globe, Building2, Loader2, AlertCircle, Search, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile, Workshop } from '@/types';
import { useCountries } from '@/hooks/useCountries';

interface AdminWithAssignments {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  assignments: AssignmentRow[];
}

interface AssignmentRow {
  id: string;
  admin_user_id: string;
  country_ids: string[];
  workshop_ids: string[];
  active: boolean;
  created_at: string;
  // enriched
  country_names?: string[];
  workshop_names?: string[];
}

export default function ManageWarrantyAdminsPage() {
  const { profile } = useAuth();
  const { countries, buildE164Phone, getCallingCode } = useCountries();
  const [admins, setAdmins] = useState<AdminWithAssignments[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite drawer
  const [showInvite, setShowInvite] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invPhoneCountry, setInvPhoneCountry] = useState('');
  const [invError, setInvError] = useState('');
  const [inviting, setInviting] = useState(false);

  // Assignment drawer
  const [showAssign, setShowAssign] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [allCountries, setAllCountries] = useState(false);
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [allWorkshops, setAllWorkshops] = useState(false);
  const [selWorkshops, setSelWorkshops] = useState<string[]>([]);
  const [workshopsList, setWorkshopsList] = useState<Workshop[]>([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [workshopSearch, setWorkshopSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const isSystemAdmin = profile?.role === 'system_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const hasAccess = isSystemAdmin || isSuperAdmin;

  useEffect(() => {
    if (hasAccess) fetchAll();
  }, [hasAccess]);

  useEffect(() => {
    if (countries.length > 0 && !invPhoneCountry) {
      setInvPhoneCountry(countries[0].name);
    }
  }, [countries]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      // Fetch warranty admin profiles + pending invites
      const [profilesRes, invitesRes, assignmentsRes, workshopsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'warranty_admin').neq('status', 'REMOVED'),
        supabase.from('user_invites').select('*').eq('role', 'warranty_admin' as any).eq('status', 'PENDING'),
        supabase.from('warranty_admin_assignments' as any).select('*').eq('active', true).order('created_at', { ascending: false }),
        supabase.from('workshops').select('id, name, country').order('name'),
      ]);

      const profiles = (profilesRes.data || []) as unknown as UserProfile[];
      const invites = (invitesRes.data || []) as any[];
      const assignments = (assignmentsRes.data || []) as unknown as AssignmentRow[];
      setWorkshopsList((workshopsRes.data || []) as unknown as Workshop[]);

      // Build workshop name map
      const wsMap = new Map((workshopsRes.data || []).map((w: any) => [w.id, w.name]));
      // Build country name map from useCountries
      const countryMap = new Map(countries.map(c => [c.iso2, c.name]));

      // Enrich assignments
      assignments.forEach(a => {
        a.country_names = (a.country_ids || []).map(id => countryMap.get(id) || id);
        a.workshop_names = (a.workshop_ids || []).map(id => wsMap.get(id) || id);
      });

      // Build admin list
      const adminMap = new Map<string, AdminWithAssignments>();

      for (const p of profiles) {
        adminMap.set(p.user_id, {
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          status: p.status,
          assignments: assignments.filter(a => a.admin_user_id === p.user_id),
        });
      }

      // Add pending invites as "INVITED" admins
      for (const inv of invites) {
        if (!Array.from(adminMap.values()).some(a => a.email === inv.email)) {
          adminMap.set(`invite-${inv.id}`, {
            user_id: `invite-${inv.id}`,
            full_name: inv.full_name,
            email: inv.email,
            phone: inv.phone,
            status: 'INVITED',
            assignments: [],
          });
        }
      }

      setAdmins(Array.from(adminMap.values()));
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Invite flow ---
  const resetInvite = () => {
    setInvName(''); setInvEmail(''); setInvPhone(''); setInvError('');
    setInvPhoneCountry(countries.length > 0 ? countries[0].name : '');
  };

  const handleInvite = async () => {
    if (!profile) return;
    setInvError('');
    if (!invName.trim()) { toast.error('Name is required'); return; }
    if (!invEmail.trim()) { toast.error('Email is required'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(invEmail)) { toast.error('Please enter a valid email'); return; }

    setInviting(true);
    try {
      const normalizedEmail = invEmail.toLowerCase().trim();
      const e164Phone = invPhone.trim() ? buildE164Phone(invPhoneCountry, invPhone) : null;

      // Dedupe
      const dedupeBody: Record<string, any> = { dedupe_only: true, email: normalizedEmail };
      if (e164Phone) dedupeBody.phone = e164Phone;
      const { data: checkResult } = await supabase.functions.invoke('check-invite', { body: dedupeBody });
      if (checkResult?.error) { setInvError(checkResult.error); setInviting(false); return; }

      const insertData: Record<string, any> = {
        full_name: invName.trim(),
        role: 'warranty_admin' as any,
        workshop_id: null,
        country: null,
        invited_by: profile.id,
        email: normalizedEmail,
        phone: e164Phone,
      };

      const { error } = await supabase.from('user_invites').insert(insertData as any);
      if (error) throw error;

      toast.success(`Warranty Admin invite sent to ${invName.trim()}`);
      resetInvite();
      setShowInvite(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invite');
    } finally {
      setInviting(false);
    }
  };

  // --- Assignment flow ---
  const openAssignDrawer = async () => {
    setShowAssign(true);
    setSelectedAdminId('');
    setAllCountries(false);
    setSelCountries([]);
    setAllWorkshops(false);
    setSelWorkshops([]);
    setCountrySearch('');
    setWorkshopSearch('');
  };

  const activeAdmins = useMemo(
    () => admins.filter(a => a.status === 'ACTIVE'),
    [admins]
  );

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return countries;
    const q = countrySearch.toLowerCase();
    return countries.filter(c => c.name.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const filteredWorkshops = useMemo(() => {
    let ws = workshopsList;
    // Filter by selected countries if any
    if (!allCountries && selCountries.length > 0) {
      const countryNames = selCountries.map(iso => countries.find(c => c.iso2 === iso)?.name).filter(Boolean);
      ws = ws.filter(w => w.country && countryNames.includes(w.country));
    }
    if (workshopSearch) {
      const q = workshopSearch.toLowerCase();
      ws = ws.filter(w => w.name.toLowerCase().includes(q));
    }
    return ws;
  }, [workshopsList, allCountries, selCountries, workshopSearch, countries]);

  const toggleCountry = (iso2: string) => {
    setSelCountries(prev =>
      prev.includes(iso2) ? prev.filter(c => c !== iso2) : [...prev, iso2]
    );
  };

  const toggleWorkshop = (id: string) => {
    setSelWorkshops(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const handleSaveAssignment = async () => {
    if (!selectedAdminId || !profile) return;
    setSaving(true);
    try {
      const countryIds = allCountries ? [] : selCountries;
      const workshopIds = allWorkshops ? [] : selWorkshops;

      const { error } = await supabase
        .from('warranty_admin_assignments' as any)
        .insert({
          admin_user_id: selectedAdminId,
          country_ids: countryIds,
          workshop_ids: workshopIds,
          active: true,
          created_by: profile.user_id,
        } as any);

      if (error) throw error;
      toast.success('Assignment created');
      setShowAssign(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (assignmentId: string) => {
    try {
      await supabase
        .from('warranty_admin_assignments' as any)
        .update({ active: false } as any)
        .eq('id', assignmentId);
      toast.success('Assignment removed');
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    }
  };

  const getScopeLabel = (a: AssignmentRow) => {
    const noCountries = !a.country_ids?.length;
    const noWorkshops = !a.workshop_ids?.length;
    if (noCountries && noWorkshops) return 'All Workshops (Global)';
    const parts: string[] = [];
    if (a.country_names?.length) parts.push(`Countries: ${a.country_names.join(', ')}`);
    if (a.workshop_names?.length) parts.push(`Workshops: ${a.workshop_names.join(', ')}`);
    if (a.country_ids?.length && noWorkshops) parts.push('(All workshops in selected countries)');
    return parts.join(' · ');
  };

  if (!hasAccess) {
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
      <PageHeader title="Warranty Admins" showBack />
      <div className="p-4 space-y-4">
        {/* CTAs */}
        <div className="flex gap-2 justify-end flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { resetInvite(); setShowInvite(true); }}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            Create Warranty Admin
          </Button>
          <Button size="sm" onClick={openAssignDrawer}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Assignment
          </Button>
        </div>

        {/* Admin list */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : admins.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No warranty admins yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {admins.map(admin => (
              <Card key={admin.user_id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{admin.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{admin.email || admin.phone || '—'}</p>
                    </div>
                    <Badge variant={admin.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                      {admin.status}
                    </Badge>
                  </div>

                  {admin.assignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-12 italic">No scope assigned</p>
                  ) : (
                    <div className="pl-12 space-y-1.5">
                      {admin.assignments.map(a => (
                        <div key={a.id} className="flex items-start gap-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap gap-1">
                              {!a.country_ids?.length && !a.workshop_ids?.length ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Globe className="h-2.5 w-2.5 mr-0.5" />
                                  All Workshops (Global)
                                </Badge>
                              ) : (
                                <>
                                  {(a.country_names || []).map(cn => (
                                    <Badge key={cn} variant="outline" className="text-[10px]">
                                      <Globe className="h-2.5 w-2.5 mr-0.5" />{cn}
                                    </Badge>
                                  ))}
                                  {(a.workshop_names || []).map(wn => (
                                    <Badge key={wn} variant="outline" className="text-[10px]">
                                      <Building2 className="h-2.5 w-2.5 mr-0.5" />{wn}
                                    </Badge>
                                  ))}
                                  {a.country_ids?.length > 0 && !a.workshop_ids?.length && (
                                    <span className="text-muted-foreground italic">All workshops in countries</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => handleDeactivate(a.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Warranty Admin Drawer */}
      <Drawer open={showInvite} onOpenChange={setShowInvite}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create Warranty Admin
            </DrawerTitle>
            <DrawerDescription>
              Invite a new Warranty Admin. They will activate via the New User flow.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter full name" value={invName} onChange={e => setInvName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="admin@example.com" value={invEmail} onChange={e => { setInvEmail(e.target.value); setInvError(''); }} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <div className="flex gap-2">
                <div className="w-[140px] shrink-0">
                  <Select value={invPhoneCountry} onValueChange={setInvPhoneCountry}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {countries.map(c => (
                        <SelectItem key={c.name} value={c.name}>{c.name} ({c.calling_code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="text" inputMode="numeric" placeholder="712345678"
                  value={invPhone}
                  onChange={e => { setInvPhone(e.target.value.replace(/\D/g, '').slice(0, 9)); setInvError(''); }}
                  maxLength={9} className="h-11"
                />
              </div>
            </div>
            {invError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{invError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The warranty admin will have no workshop assignment. Scope is set via assignments below.
            </p>
          </div>

          <DrawerFooter className="pb-safe">
            <Button onClick={handleInvite} disabled={inviting} className="h-11">
              {inviting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Send Invite'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="h-11">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* New Assignment Drawer */}
      <Drawer open={showAssign} onOpenChange={setShowAssign}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>New Assignment</DrawerTitle>
            <DrawerDescription>Assign a warranty admin to countries and/or workshops.</DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0">
            {/* Admin selector */}
            <div className="space-y-1.5">
              <Label>Warranty Admin <span className="text-destructive">*</span></Label>
              <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select admin..." /></SelectTrigger>
                <SelectContent>
                  {activeAdmins.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name} ({a.email || a.phone})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeAdmins.length === 0 && (
                <p className="text-xs text-muted-foreground">No active warranty admins. Create one first.</p>
              )}
            </div>

            {/* Countries */}
            <div className="space-y-1.5">
              <Label>Countries</Label>
              <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                <Checkbox checked={allCountries} onCheckedChange={v => { setAllCountries(!!v); if (v) setSelCountries([]); }} />
                <span className="text-sm">All countries</span>
              </label>
              {!allCountries && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search countries..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)} className="pl-10 h-10" />
                    {countrySearch && (
                      <button type="button" onClick={() => setCountrySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5 border rounded-md p-2">
                    {filteredCountries.map(c => (
                      <label key={c.iso2} className="flex items-center gap-2 min-h-[36px] cursor-pointer px-1 rounded hover:bg-accent/50">
                        <Checkbox checked={selCountries.includes(c.iso2)} onCheckedChange={() => toggleCountry(c.iso2)} />
                        <span className="text-sm">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {selCountries.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selCountries.map(iso => (
                        <Badge key={iso} variant="secondary" className="text-xs gap-1">
                          {countries.find(c => c.iso2 === iso)?.name || iso}
                          <button type="button" onClick={() => toggleCountry(iso)} className="ml-0.5"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Workshops */}
            <div className="space-y-1.5">
              <Label>Workshops</Label>
              <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                <Checkbox checked={allWorkshops} onCheckedChange={v => { setAllWorkshops(!!v); if (v) setSelWorkshops([]); }} />
                <span className="text-sm">
                  {allCountries || selCountries.length === 0 ? 'All workshops (global)' : 'All workshops in selected countries'}
                </span>
              </label>
              {!allWorkshops && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search workshops..." value={workshopSearch} onChange={e => setWorkshopSearch(e.target.value)} className="pl-10 h-10" />
                    {workshopSearch && (
                      <button type="button" onClick={() => setWorkshopSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5 border rounded-md p-2">
                    {filteredWorkshops.map(w => (
                      <label key={w.id} className="flex items-center gap-2 min-h-[36px] cursor-pointer px-1 rounded hover:bg-accent/50">
                        <Checkbox checked={selWorkshops.includes(w.id)} onCheckedChange={() => toggleWorkshop(w.id)} />
                        <span className="text-sm truncate">{w.name}</span>
                        {w.country && <span className="text-xs text-muted-foreground ml-auto shrink-0">{w.country}</span>}
                      </label>
                    ))}
                    {filteredWorkshops.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No workshops found</p>
                    )}
                  </div>
                  {selWorkshops.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selWorkshops.map(id => (
                        <Badge key={id} variant="secondary" className="text-xs gap-1">
                          {workshopsList.find(w => w.id === id)?.name || id}
                          <button type="button" onClick={() => toggleWorkshop(id)} className="ml-0.5"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Empty countries = all countries. Empty workshops = all workshops in selected countries (or globally if no countries selected).
            </p>
          </div>

          <DrawerFooter className="pb-safe">
            <Button
              onClick={handleSaveAssignment}
              disabled={!selectedAdminId || saving}
              className="h-11"
            >
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Assignment'}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="h-11">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppLayout>
  );
}
