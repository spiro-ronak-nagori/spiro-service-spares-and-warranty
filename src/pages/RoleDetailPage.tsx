import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Globe, MapPin, Building2, Link2, Users, Clock, Save, Shield, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Permission {
  id: string;
  permission_group: string;
  permission_key: string;
  display_label: string;
  enabled: boolean;
  sort_order: number;
}

interface PolicyOverride {
  id: string;
  policy_type: string;
  permission_key: string;
  enabled: boolean;
}

interface RoleData {
  id: string;
  role_key: string;
  display_name: string;
  description: string | null;
  default_scope: string;
  is_system_managed: boolean;
  updated_at: string;
}

const GROUP_LABELS: Record<string, string> = {
  NAVIGATION: 'Navigation',
  JOB_CARDS: 'Job Cards',
  SPARES_MANAGEMENT: 'Spares Management',
  WARRANTY: 'Warranty',
  REPORTS: 'Reports',
  USERS_TEAM: 'Users & Team',
  MASTERS_CONFIG: 'Masters & Config',
  PROFILE_SELF: 'Profile / Self',
};

const GROUP_ORDER = [
  'NAVIGATION', 'JOB_CARDS', 'SPARES_MANAGEMENT', 'WARRANTY',
  'REPORTS', 'USERS_TEAM', 'MASTERS_CONFIG', 'PROFILE_SELF',
];

const POLICY_TYPES = ['COCO', 'FOFO'];

const SCOPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  global: { icon: <Globe className="h-4 w-4" />, label: 'Global', color: 'bg-primary/10 text-primary' },
  country: { icon: <MapPin className="h-4 w-4" />, label: 'Country', color: 'bg-amber-500/10 text-amber-600' },
  workshop: { icon: <Building2 className="h-4 w-4" />, label: 'Workshop', color: 'bg-blue-500/10 text-blue-600' },
  assignment: { icon: <Link2 className="h-4 w-4" />, label: 'Assignment-Scoped', color: 'bg-purple-500/10 text-purple-600' },
};

export default function RoleDetailPage() {
  const { profile } = useAuth();
  const { roleKey } = useParams<{ roleKey: string }>();
  const navigate = useNavigate();

  const [role, setRole] = useState<RoleData | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<PolicyOverride[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track original state for change detection
  const [originalPerms, setOriginalPerms] = useState<Record<string, boolean>>({});
  const [originalOverrides, setOriginalOverrides] = useState<Record<string, boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Add override dialog
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [newOverridePolicyType, setNewOverridePolicyType] = useState('FOFO');
  const [newOverridePermKey, setNewOverridePermKey] = useState('');
  const [newOverrideEnabled, setNewOverrideEnabled] = useState(false);
  const [deletingOverrideId, setDeletingOverrideId] = useState<string | null>(null);
  // Track overrides to delete on save
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  // Track new overrides added locally (not yet persisted)
  const [pendingNewOverrides, setPendingNewOverrides] = useState<PolicyOverride[]>([]);

  const isSystemAdmin = profile?.role === 'system_admin';

  useEffect(() => {
    if (!isSystemAdmin || !roleKey) return;
    loadData();
  }, [isSystemAdmin, roleKey]);

  const loadData = async () => {
    setLoading(true);
    setPendingDeleteIds(new Set());
    setPendingNewOverrides([]);
    try {
      const { data: roleData } = await supabase
        .from('rbac_roles')
        .select('*')
        .eq('role_key', roleKey as any)
        .single();

      if (!roleData) { navigate('/console/roles'); return; }
      setRole(roleData as any);

      const { data: permData } = await supabase
        .from('rbac_permissions')
        .select('*')
        .eq('role_id', roleData.id)
        .order('sort_order');

      setPermissions((permData || []) as Permission[]);
      const origPerms: Record<string, boolean> = {};
      (permData || []).forEach((p: any) => { origPerms[p.id] = p.enabled; });
      setOriginalPerms(origPerms);

      const { data: overrideData } = await supabase
        .from('rbac_policy_overrides')
        .select('*')
        .eq('role_id', roleData.id);

      setOverrides((overrideData || []) as PolicyOverride[]);
      const origOv: Record<string, boolean> = {};
      (overrideData || []).forEach((o: any) => { origOv[o.id] = o.enabled; });
      setOriginalOverrides(origOv);

      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', roleKey as any)
        .eq('is_active', true);

      setUserCount(count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const groupedPerms = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    GROUP_ORDER.forEach((g) => { groups[g] = []; });
    permissions.forEach((p) => {
      if (!groups[p.permission_group]) groups[p.permission_group] = [];
      groups[p.permission_group].push(p);
    });
    return groups;
  }, [permissions]);

  const togglePerm = (id: string) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const toggleOverride = (id: string) => {
    // Check if it's a pending new override
    const isPending = pendingNewOverrides.some(o => o.id === id);
    if (isPending) {
      setPendingNewOverrides(prev => prev.map(o => o.id === id ? { ...o, enabled: !o.enabled } : o));
    } else {
      setOverrides((prev) =>
        prev.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o))
      );
    }
  };

  // All overrides combined (existing + pending new, minus pending deletes)
  const allOverrides = useMemo(() => {
    const existing = overrides.filter(o => !pendingDeleteIds.has(o.id));
    return [...existing, ...pendingNewOverrides];
  }, [overrides, pendingDeleteIds, pendingNewOverrides]);

  // Available permission keys for new override (exclude already overridden for same policy type)
  const availablePermKeysForOverride = useMemo(() => {
    const existingKeys = new Set(
      allOverrides
        .filter(o => o.policy_type === newOverridePolicyType)
        .map(o => o.permission_key)
    );
    return permissions.filter(p => !existingKeys.has(p.permission_key));
  }, [permissions, allOverrides, newOverridePolicyType]);

  const handleAddOverride = () => {
    if (!newOverridePermKey || !role) return;
    const tempId = `new_${Date.now()}_${Math.random()}`;
    setPendingNewOverrides(prev => [...prev, {
      id: tempId,
      policy_type: newOverridePolicyType,
      permission_key: newOverridePermKey,
      enabled: newOverrideEnabled,
    }]);
    setShowAddOverride(false);
    setNewOverridePermKey('');
    setNewOverrideEnabled(false);
  };

  const handleDeleteOverride = (id: string) => {
    const isPending = pendingNewOverrides.some(o => o.id === id);
    if (isPending) {
      setPendingNewOverrides(prev => prev.filter(o => o.id !== id));
    } else {
      setPendingDeleteIds(prev => new Set(prev).add(id));
    }
    setDeletingOverrideId(null);
  };

  const hasChanges = useMemo(() => {
    const permChanged = permissions.some((p) => originalPerms[p.id] !== p.enabled);
    const ovChanged = overrides.some((o) => !pendingDeleteIds.has(o.id) && originalOverrides[o.id] !== o.enabled);
    return permChanged || ovChanged || pendingDeleteIds.size > 0 || pendingNewOverrides.length > 0;
  }, [permissions, overrides, originalPerms, originalOverrides, pendingDeleteIds, pendingNewOverrides]);

  const changedItems = useMemo(() => {
    const items: { label: string; from: string; to: string }[] = [];
    permissions.forEach((p) => {
      if (originalPerms[p.id] !== p.enabled) {
        items.push({
          label: p.display_label,
          from: originalPerms[p.id] ? 'Enabled' : 'Disabled',
          to: p.enabled ? 'Enabled' : 'Disabled',
        });
      }
    });
    overrides.forEach((o) => {
      if (pendingDeleteIds.has(o.id)) {
        const perm = permissions.find((p) => p.permission_key === o.permission_key);
        items.push({
          label: `${o.policy_type}: ${perm?.display_label || o.permission_key}`,
          from: 'Exists',
          to: 'Deleted',
        });
      } else if (originalOverrides[o.id] !== o.enabled) {
        const perm = permissions.find((p) => p.permission_key === o.permission_key);
        items.push({
          label: `${o.policy_type}: ${perm?.display_label || o.permission_key}`,
          from: originalOverrides[o.id] ? 'Enabled' : 'Disabled',
          to: o.enabled ? 'Enabled' : 'Disabled',
        });
      }
    });
    pendingNewOverrides.forEach((o) => {
      const perm = permissions.find((p) => p.permission_key === o.permission_key);
      items.push({
        label: `${o.policy_type}: ${perm?.display_label || o.permission_key}`,
        from: '—',
        to: o.enabled ? 'Enabled' : 'Disabled',
      });
    });
    return items;
  }, [permissions, overrides, originalPerms, originalOverrides, pendingDeleteIds, pendingNewOverrides]);

  const handleSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    try {
      // Update changed permissions
      const changedPerms = permissions.filter((p) => originalPerms[p.id] !== p.enabled);
      for (const p of changedPerms) {
        await supabase.from('rbac_permissions').update({ enabled: p.enabled }).eq('id', p.id);
      }

      // Update changed overrides
      const changedOvs = overrides.filter((o) => !pendingDeleteIds.has(o.id) && originalOverrides[o.id] !== o.enabled);
      for (const o of changedOvs) {
        await supabase.from('rbac_policy_overrides').update({ enabled: o.enabled }).eq('id', o.id);
      }

      // Delete overrides
      for (const id of pendingDeleteIds) {
        await supabase.from('rbac_policy_overrides').delete().eq('id', id);
      }

      // Insert new overrides
      if (role) {
        for (const o of pendingNewOverrides) {
          await supabase.from('rbac_policy_overrides').insert({
            role_id: role.id,
            policy_type: o.policy_type as any,
            permission_key: o.permission_key,
            enabled: o.enabled,
          });
        }
      }

      // Audit log
      if (role && profile) {
        for (const item of changedItems) {
          await supabase.from('rbac_audit_log').insert({
            actor_user_id: profile.user_id,
            action: 'permission_change',
            target_role: role.role_key,
            changed_field: item.label,
            old_value: item.from,
            new_value: item.to,
          });
        }
      }

      toast.success(`Saved ${changedItems.length} change${changedItems.length !== 1 ? 's' : ''}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isSystemAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console/roles" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Only System Admin can access this page.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="Loading..." showBack backTo="/console/roles" />
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!role) return null;

  const scopeMeta = SCOPE_META[role.default_scope] || SCOPE_META.global;

  return (
    <AppLayout>
      <PageHeader title={role.display_name} showBack backTo="/console/roles" />
      <div className="p-4 space-y-4 pb-24">
        {/* Role Overview */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-base">{role.display_name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                {scopeMeta.icon}
                <div>
                  <p className="text-muted-foreground">Default Scope</p>
                  <p className="font-medium">{scopeMeta.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Active Users</p>
                  <p className="font-medium">{userCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Permissions</p>
                  <p className="font-medium">{permissions.filter((p) => p.enabled).length} / {permissions.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{new Date(role.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permission Groups */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">Permissions</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Accordion type="multiple" className="w-full">
              {GROUP_ORDER.map((groupKey) => {
                const perms = groupedPerms[groupKey] || [];
                if (perms.length === 0) return null;
                const enabledCount = perms.filter((p) => p.enabled).length;

                return (
                  <AccordionItem key={groupKey} value={groupKey} className="border-b last:border-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{GROUP_LABELS[groupKey]}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {enabledCount}/{perms.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3">
                      <div className="space-y-2.5">
                        {perms.map((p) => (
                          <div key={p.id} className="flex items-center justify-between">
                            <span className="text-xs text-foreground">{p.display_label}</span>
                            <Switch
                              checked={p.enabled}
                              onCheckedChange={() => togglePerm(p.id)}
                              className="scale-90"
                            />
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>

        {/* COCO / FOFO Overrides */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Policy Overrides (COCO / FOFO)</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowAddOverride(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              These overrides change specific permissions when the workshop business type is COCO or FOFO.
            </p>
            {allOverrides.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No policy overrides configured</p>
            ) : (
              <div className="space-y-2.5">
                {allOverrides.map((o) => {
                  const perm = permissions.find((p) => p.permission_key === o.permission_key);
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{o.policy_type}</Badge>
                        <span className="text-xs truncate">{perm?.display_label || o.permission_key}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch
                          checked={o.enabled}
                          onCheckedChange={() => toggleOverride(o.id)}
                          className="scale-90"
                        />
                        <button
                          type="button"
                          onClick={() => setDeletingOverrideId(o.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky Save Bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 flex items-center justify-between z-50">
          <span className="text-xs text-muted-foreground">
            {changedItems.length} unsaved change{changedItems.length !== 1 ? 's' : ''}
          </span>
          <Button size="sm" onClick={() => setShowConfirm(true)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Add Override Dialog */}
      <Dialog open={showAddOverride} onOpenChange={setShowAddOverride}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Policy Override</DialogTitle>
            <DialogDescription>
              Override a permission for a specific workshop business type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium">Policy Type</label>
              <Select value={newOverridePolicyType} onValueChange={setNewOverridePolicyType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map(pt => (
                    <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Permission</label>
              <Select value={newOverridePermKey} onValueChange={setNewOverridePermKey}>
                <SelectTrigger><SelectValue placeholder="Select permission" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {availablePermKeysForOverride.map(p => (
                    <SelectItem key={p.permission_key} value={p.permission_key}>
                      {p.display_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Enabled in {newOverridePolicyType} workshops</label>
              <Switch checked={newOverrideEnabled} onCheckedChange={setNewOverrideEnabled} className="scale-90" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOverride(false)}>Cancel</Button>
            <Button onClick={handleAddOverride} disabled={!newOverridePermKey}>Add Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Override Confirmation */}
      <AlertDialog open={!!deletingOverrideId} onOpenChange={() => setDeletingOverrideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Override?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the policy override. The change will be applied when you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingOverrideId && handleDeleteOverride(deletingOverrideId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Permission Changes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm font-medium">Role: {role.display_name}</p>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {changedItems.map((item, i) => (
                    <div key={i} className="text-xs flex items-center gap-2 py-1 border-b last:border-0">
                      <span className="flex-1">{item.label}</span>
                      <Badge variant="outline" className="text-[10px] line-through">{item.from}</Badge>
                      <span>→</span>
                      <Badge variant={item.to === 'Enabled' ? 'default' : 'secondary'} className="text-[10px]">{item.to}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Confirm & Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
