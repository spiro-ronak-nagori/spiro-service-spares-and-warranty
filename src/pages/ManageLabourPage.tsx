import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCountries } from '@/hooks/useCountries';
import { useCountryBoolSetting } from '@/hooks/useCountrySetting';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Globe, AlertTriangle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { LabourMasterItem, useLabourMaster } from '@/hooks/useLabour';

export default function ManageLabourPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'system_admin' || profile?.role === 'super_admin';
  const { countries, isLoading: countriesLoading } = useCountries();
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [labourEnabledLocal, setLabourEnabledLocal] = useState<boolean | null>(null);

  // Labour feature depends on Spares Flow
  const { value: sparesEnabled, isLoading: sparesLoading } = useCountryBoolSetting('ENABLE_SPARES_FLOW', selectedCountry || null);
  const { value: labourEnabledFromDb, isLoading: labourFlagLoading } = useCountryBoolSetting('ENABLE_LABOUR', selectedCountry || null);

  // Sync DB value into local state when it loads or country changes
  useEffect(() => {
    if (!labourFlagLoading) {
      setLabourEnabledLocal(labourEnabledFromDb);
    }
  }, [labourEnabledFromDb, labourFlagLoading, selectedCountry]);

  const { items, isLoading: labourLoading, refetch } = useLabourMaster(selectedCountry || null);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<LabourMasterItem | null>(null);
  const [form, setForm] = useState({
    labour_name: '',
    labour_code: '',
    description: '',
    standard_duration_minutes: 60,
    default_rate: '',
    duration_editable: true,
    rate_editable: false,
    is_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Auto-select first country
  useEffect(() => {
    if (!selectedCountry && countries.length > 0) {
      setSelectedCountry(countries[0].name);
    }
  }, [countries, selectedCountry]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({
      labour_name: '',
      labour_code: '',
      description: '',
      standard_duration_minutes: 60,
      default_rate: '',
      duration_editable: true,
      rate_editable: false,
      is_active: true,
    });
    setShowDialog(true);
  };

  const openEdit = (item: LabourMasterItem) => {
    setEditingItem(item);
    setForm({
      labour_name: item.labour_name,
      labour_code: item.labour_code || '',
      description: item.description || '',
      standard_duration_minutes: item.standard_duration_minutes,
      default_rate: item.default_rate != null ? String(item.default_rate) : '',
      duration_editable: item.duration_editable,
      rate_editable: item.rate_editable,
      is_active: item.is_active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.labour_name.trim() || !selectedCountry || !profile) return;
    setIsSaving(true);
    try {
      const payload: any = {
        country: selectedCountry,
        labour_name: form.labour_name.trim(),
        labour_code: form.labour_code.trim() || null,
        description: form.description.trim() || null,
        standard_duration_minutes: form.standard_duration_minutes,
        default_rate: form.default_rate ? parseFloat(form.default_rate) : null,
        duration_editable: form.duration_editable,
        rate_editable: form.rate_editable,
        is_active: form.is_active,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('labour_master' as any)
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;

        await supabase.from('labour_audit_log' as any).insert({
          action: 'EDIT',
          entity_type: 'MASTER',
          entity_id: editingItem.id,
          country: selectedCountry,
          actor_user_id: profile.id,
          old_value: JSON.stringify({ labour_name: editingItem.labour_name, is_active: editingItem.is_active }),
          new_value: JSON.stringify(payload),
        });
        toast.success('Labour item updated');
      } else {
        const { data, error } = await supabase
          .from('labour_master' as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        await supabase.from('labour_audit_log' as any).insert({
          action: 'ADD',
          entity_type: 'MASTER',
          entity_id: (data as any).id,
          country: selectedCountry,
          actor_user_id: profile.id,
          new_value: JSON.stringify(payload),
        });
        toast.success('Labour item added');
      }

      setShowDialog(false);
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLabourEnabled = async (enabled: boolean) => {
    if (!selectedCountry || !profile) return;
    try {
      const { data: existing } = await supabase
        .from('country_settings' as any)
        .select('id')
        .eq('country_name', selectedCountry)
        .eq('setting_key', 'ENABLE_LABOUR')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('country_settings' as any)
          .update({ value: String(enabled) })
          .eq('id', (existing as any).id);
      } else {
        await supabase
          .from('country_settings' as any)
          .insert({
            country_name: selectedCountry,
            setting_key: 'ENABLE_LABOUR',
            value: String(enabled),
          });
      }

      await supabase.from('labour_audit_log' as any).insert({
        action: enabled ? 'ENABLE' : 'DISABLE',
        entity_type: 'CONFIG',
        country: selectedCountry,
        actor_user_id: profile.id,
        new_value: JSON.stringify({ ENABLE_LABOUR: enabled }),
      });

      toast.success(`Labour ${enabled ? 'enabled' : 'disabled'} for ${selectedCountry}`);
    } catch (err: any) {
      toast.error('Failed to update setting');
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console/system-config" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  const isLoadingAll = countriesLoading || sparesLoading || labourFlagLoading || labourLoading;

  return (
    <AppLayout>
      <PageHeader title="Manage Labour" showBack backTo="/console/system-config" />
      <div className="p-4 space-y-4">
        {/* Country Selector */}
        <div className="sticky top-0 z-10 bg-background pb-2">
          <Label className="text-xs text-muted-foreground mb-1 block">Country</Label>
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger>
              <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Select country…" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedCountry ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-sm">Select a country to manage labour configuration.</p>
            </CardContent>
          </Card>
        ) : isLoadingAll ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* Spares Flow dependency warning */}
            {!sparesEnabled && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Labour is inactive because Spares Flow is disabled for {selectedCountry}. Enable Spares Flow first in Manage Toggles.
                </AlertDescription>
              </Alert>
            )}

            {/* Labour Toggle */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Labour</p>
                    <p className="text-xs text-muted-foreground">Allow labour entries in job cards for {selectedCountry}</p>
                  </div>
                  <Switch
                    checked={!!labourEnabledLocal && sparesEnabled}
                    onCheckedChange={handleToggleLabourEnabled}
                    disabled={!sparesEnabled}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Labour Catalog */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Labour Catalog
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={openAdd}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No labour items configured for {selectedCountry}.
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => openEdit(item)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{item.labour_name}</p>
                            {!item.is_active && (
                              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.labour_code && (
                              <span className="text-xs text-muted-foreground">{item.labour_code}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {item.standard_duration_minutes} min
                            </span>
                            {item.default_rate != null && (
                              <span className="text-xs text-muted-foreground">
                                • Rate: {item.default_rate}
                              </span>
                            )}
                          </div>
                        </div>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Labour Item' : 'Add Labour Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Labour Name *</Label>
              <Input
                value={form.labour_name}
                onChange={(e) => setForm(f => ({ ...f, labour_name: e.target.value }))}
                placeholder="e.g. Battery Replacement Labour"
              />
            </div>
            <div>
              <Label>Labour Code</Label>
              <Input
                value={form.labour_code}
                onChange={(e) => setForm(f => ({ ...f, labour_code: e.target.value }))}
                placeholder="e.g. LAB-001"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={form.standard_duration_minutes}
                  onChange={(e) => setForm(f => ({ ...f, standard_duration_minutes: parseInt(e.target.value) || 0 }))}
                  min={1}
                />
              </div>
              <div>
                <Label>Default Rate</Label>
                <Input
                  type="number"
                  value={form.default_rate}
                  onChange={(e) => setForm(f => ({ ...f, default_rate: e.target.value }))}
                  placeholder="Optional"
                  step="0.01"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Duration editable in JC</Label>
                <Switch
                  checked={form.duration_editable}
                  onCheckedChange={(v) => setForm(f => ({ ...f, duration_editable: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Rate editable in JC</Label>
                <Switch
                  checked={form.rate_editable}
                  onCheckedChange={(v) => setForm(f => ({ ...f, rate_editable: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Active</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.labour_name.trim() || isSaving}>
              {isSaving ? 'Saving…' : editingItem ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
