import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Package, Plus, ChevronDown, Pencil, Settings2, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { SparePart, SparePartApplicability } from '@/types';

interface VehicleModel {
  id: string;
  name: string;
}

const COLOR_OPTIONS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'] as const;

export default function ManageSpareMasterPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'system_admin' || profile?.role === 'super_admin';

  const [parts, setParts] = useState<SparePart[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [applicability, setApplicability] = useState<SparePartApplicability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);

  // Add/edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [form, setForm] = useState({
    part_name: '',
    part_code: '',
    partno_required: false,
    serial_required: false,
    max_qty_allowed: 50,
    usage_proof_photos_required_count: 0,
    warranty_available: true,
    goodwill_available: true,
  });

  // Applicability dialog
  const [showAppDialog, setShowAppDialog] = useState(false);
  const [appPartId, setAppPartId] = useState('');
  const [appModelId, setAppModelId] = useState('');
  const [appColor, setAppColor] = useState<string>('ALL');

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    setIsLoading(true);
    const [partsRes, modelsRes, appRes] = await Promise.all([
      supabase.from('spare_parts_master' as any).select('*').order('part_name'),
      supabase.from('vehicle_models').select('id, name').order('sort_order'),
      supabase.from('spare_parts_applicability' as any).select('*'),
    ]);
    setParts((partsRes.data || []) as unknown as SparePart[]);
    setModels((modelsRes.data || []) as VehicleModel[]);
    setApplicability((appRes.data || []) as unknown as SparePartApplicability[]);
    setIsLoading(false);
  };

  const openAddDialog = () => {
    setEditingPart(null);
    setForm({
      part_name: '', part_code: '', partno_required: false, serial_required: false,
      max_qty_allowed: 50, usage_proof_photos_required_count: 0,
      warranty_available: true, goodwill_available: true,
    });
    setShowDialog(true);
  };

  const openEditDialog = (part: SparePart) => {
    setEditingPart(part);
    setForm({
      part_name: part.part_name,
      part_code: part.part_code || '',
      partno_required: part.partno_required,
      serial_required: part.serial_required,
      max_qty_allowed: part.max_qty_allowed,
      usage_proof_photos_required_count: part.usage_proof_photos_required_count,
      warranty_available: part.warranty_available,
      goodwill_available: part.goodwill_available,
    });
    setShowDialog(true);
  };

  const handleSavePart = async () => {
    if (!form.part_name.trim()) { toast.error('Part name is required'); return; }
    try {
      if (editingPart) {
        const { error } = await supabase.from('spare_parts_master' as any)
          .update({
            part_name: form.part_name.trim(),
            part_code: form.part_code.trim() || null,
            partno_required: form.partno_required,
            serial_required: form.serial_required,
            max_qty_allowed: form.max_qty_allowed,
            usage_proof_photos_required_count: form.usage_proof_photos_required_count,
            warranty_available: form.warranty_available,
            goodwill_available: form.goodwill_available,
          } as any)
          .eq('id', editingPart.id);
        if (error) throw error;
        toast.success('Part updated');
      } else {
        const { error } = await supabase.from('spare_parts_master' as any)
          .insert({
            part_name: form.part_name.trim(),
            part_code: form.part_code.trim() || null,
            partno_required: form.partno_required,
            serial_required: form.serial_required,
            max_qty_allowed: form.max_qty_allowed,
            usage_proof_photos_required_count: form.usage_proof_photos_required_count,
            warranty_available: form.warranty_available,
            goodwill_available: form.goodwill_available,
          } as any);
        if (error) throw error;
        toast.success('Part created');
      }
      setShowDialog(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const handleToggleActive = async (part: SparePart) => {
    try {
      const { error } = await supabase.from('spare_parts_master' as any)
        .update({ active: !part.active } as any)
        .eq('id', part.id);
      if (error) throw error;
      toast.success(`${part.part_name} ${part.active ? 'deactivated' : 'activated'}`);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const openAppDialog = (partId: string) => {
    setAppPartId(partId);
    setAppModelId('');
    setAppColor('ALL');
    setShowAppDialog(true);
  };

  const handleAddApplicability = async () => {
    if (!appModelId) { toast.error('Select a model'); return; }
    try {
      const { error } = await supabase.from('spare_parts_applicability' as any)
        .insert({
          spare_part_id: appPartId,
          vehicle_model_id: appModelId,
          color_code: appColor === 'ALL' ? null : appColor,
        } as any);
      if (error) {
        if (error.message.includes('unique_applicability')) {
          toast.error('This mapping already exists');
        } else throw error;
        return;
      }
      toast.success('Mapping added');
      setShowAppDialog(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add mapping');
    }
  };

  const handleRemoveApplicability = async (appId: string) => {
    try {
      const { error } = await supabase.from('spare_parts_applicability' as any)
        .delete()
        .eq('id', appId);
      if (error) throw error;
      toast.success('Mapping removed');
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    }
  };

  const getPartApplicability = (partId: string) =>
    applicability.filter(a => a.spare_part_id === partId);

  const getModelName = (modelId: string) =>
    models.find(m => m.id === modelId)?.name || 'Unknown';

  if (!isAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4"><Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Admin access required.</p></CardContent></Card></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Spare Parts Master"
        showBack
        backTo="/console"
        rightAction={
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" />Add Part
          </Button>
        }
      />

      <div className="p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40" /></CardContent></Card>
          ))
        ) : parts.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No spare parts yet</p>
          </CardContent></Card>
        ) : (
          parts.map(part => {
            const partApps = getPartApplicability(part.id);
            return (
              <Collapsible
                key={part.id}
                open={expandedPart === part.id}
                onOpenChange={(open) => setExpandedPart(open ? part.id : null)}
              >
                <Card className={!part.active ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{part.part_name}</span>
                          {part.part_code && (
                            <span className="text-xs text-muted-foreground">({part.part_code})</span>
                          )}
                          {!part.active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs">{partApps.length} models</Badge>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedPart === part.id ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {part.partno_required && <Badge variant="outline" className="text-[10px]">Part# Req</Badge>}
                        {part.serial_required && <Badge variant="outline" className="text-[10px]">Serial# Req</Badge>}
                        {part.warranty_available && <Badge variant="outline" className="text-[10px]">Warranty</Badge>}
                        {part.goodwill_available && <Badge variant="outline" className="text-[10px]">Goodwill</Badge>}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <Separator className="my-3" />
                      <div className="space-y-3">
                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditDialog(part)}>
                            <Pencil className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAppDialog(part.id)}>
                            <Link2 className="h-3 w-3 mr-1" />Add Model Mapping
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleToggleActive(part)}>
                            {part.active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>

                        {/* Applicability list */}
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Model Mappings</p>
                          {partApps.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No models mapped</p>
                          ) : (
                            partApps.map(app => (
                              <div key={app.id} className="flex items-center justify-between pl-4 py-1">
                                <span className="text-sm">
                                  {getModelName(app.vehicle_model_id)}
                                  {app.color_code ? ` — ${app.color_code}` : ' — All Colors'}
                                </span>
                                <Button
                                  variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                                  onClick={() => handleRemoveApplicability(app.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            );
          })
        )}
      </div>

      {/* Add/Edit Part Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPart ? 'Edit Part' : 'Add Spare Part'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Part Name *</Label>
              <Input value={form.part_name} onChange={e => setForm(f => ({ ...f, part_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Part Code</Label>
              <Input value={form.part_code} onChange={e => setForm(f => ({ ...f, part_code: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Max Qty</Label>
                <Input type="number" min={1} value={form.max_qty_allowed} onChange={e => setForm(f => ({ ...f, max_qty_allowed: parseInt(e.target.value) || 50 }))} />
              </div>
              <div className="space-y-1">
                <Label>Proof Photos Count</Label>
                <Input type="number" min={0} value={form.usage_proof_photos_required_count} onChange={e => setForm(f => ({ ...f, usage_proof_photos_required_count: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Part Number Required</Label>
                <Switch checked={form.partno_required} onCheckedChange={v => setForm(f => ({ ...f, partno_required: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Serial Number Required</Label>
                <Switch checked={form.serial_required} onCheckedChange={v => setForm(f => ({ ...f, serial_required: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Warranty Available</Label>
                <Switch checked={form.warranty_available} onCheckedChange={v => setForm(f => ({ ...f, warranty_available: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Goodwill Available</Label>
                <Switch checked={form.goodwill_available} onCheckedChange={v => setForm(f => ({ ...f, goodwill_available: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSavePart}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicability Dialog */}
      <Dialog open={showAppDialog} onOpenChange={setShowAppDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Model Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Vehicle Model *</Label>
              <Select value={appModelId} onValueChange={setAppModelId}>
                <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {models.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Color (optional)</Label>
              <Select value={appColor} onValueChange={setAppColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Colors</SelectItem>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAppDialog(false)}>Cancel</Button>
            <Button onClick={handleAddApplicability}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
