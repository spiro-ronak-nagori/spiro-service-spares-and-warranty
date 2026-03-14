import { useState, useEffect, useCallback } from 'react';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import {
  Package, Plus, ChevronDown, Pencil, Link2, Trash2, Shield, ShieldCheck, Search, X, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { SparePart, SparePartApplicability } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';

interface VehicleModel {
  id: string;
  name: string;
}

const COLOR_OPTIONS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'] as const;

/** Extracted outside component to avoid re-mount on every render (fixes focus loss) */
function SectionCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border bg-card p-3 space-y-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export default function ManageSpareMasterPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'system_admin' || profile?.role === 'super_admin';

  const isMobile = useIsMobile();

  const [parts, setParts] = useState<SparePart[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [applicability, setApplicability] = useState<SparePartApplicability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModel, setFilterModel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Add/edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [form, setForm] = useState({
    part_name: '',
    part_code: '',
    active: true,
    serial_required: false,
    old_part_srno_required: false,
    max_qty_allowed: 50,
    usage_proof_photos_required_count: 0,
    usage_proof_photo_prompts: [] as string[],
    warranty_available: true,
    goodwill_available: true,
    warranty_approval_needed: true,
    goodwill_approval_needed: true,
    warranty_old_part_photos_required_count: 1,
    warranty_old_part_photo_prompts: ['Old part close-up'] as string[],
    goodwill_old_part_photos_required_count: 1,
    goodwill_old_part_photo_prompts: ['Old part close-up'] as string[],
  });

  // Applicability dialog
  const [showAppDialog, setShowAppDialog] = useState(false);
  const [appPartId, setAppPartId] = useState('');
  const [appModelIds, setAppModelIds] = useState<string[]>([]);
  const [appColors, setAppColors] = useState<string[]>(['ALL']);

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
      part_name: '', part_code: '', active: true, serial_required: false,
      old_part_srno_required: false,
      max_qty_allowed: 50, usage_proof_photos_required_count: 0,
      usage_proof_photo_prompts: [],
      warranty_available: true, goodwill_available: true,
      warranty_approval_needed: true, goodwill_approval_needed: true,
      warranty_old_part_photos_required_count: 1,
      warranty_old_part_photo_prompts: ['Old part close-up'],
      goodwill_old_part_photos_required_count: 1,
      goodwill_old_part_photo_prompts: ['Old part close-up'],
    });
    setShowDialog(true);
  };

  const openEditDialog = (part: SparePart) => {
    setEditingPart(part);
    const prompts = Array.isArray(part.usage_proof_photo_prompts) ? part.usage_proof_photo_prompts : [];
    const warrantyPrompts = Array.isArray(part.warranty_old_part_photo_prompts) ? part.warranty_old_part_photo_prompts : ['Old part close-up'];
    const goodwillPrompts = Array.isArray(part.goodwill_old_part_photo_prompts) ? part.goodwill_old_part_photo_prompts : ['Old part close-up'];
    setForm({
      part_name: part.part_name,
      part_code: part.part_code || '',
      active: part.active,
      serial_required: part.serial_required,
      old_part_srno_required: part.old_part_srno_required ?? false,
      max_qty_allowed: part.max_qty_allowed,
      usage_proof_photos_required_count: part.usage_proof_photos_required_count,
      usage_proof_photo_prompts: prompts,
      warranty_available: part.warranty_available,
      goodwill_available: part.goodwill_available,
      warranty_approval_needed: (part as any).warranty_approval_needed ?? true,
      goodwill_approval_needed: (part as any).goodwill_approval_needed ?? true,
      warranty_old_part_photos_required_count: part.warranty_old_part_photos_required_count,
      warranty_old_part_photo_prompts: warrantyPrompts,
      goodwill_old_part_photos_required_count: part.goodwill_old_part_photos_required_count,
      goodwill_old_part_photo_prompts: goodwillPrompts,
    });
    setShowDialog(true);
  };

  // Sync prompts array length to count
  const handleProofCountChange = (count: number) => {
    const prompts = [...form.usage_proof_photo_prompts];
    while (prompts.length < count) prompts.push('');
    setForm(f => ({
      ...f,
      usage_proof_photos_required_count: count,
      usage_proof_photo_prompts: prompts.slice(0, Math.max(count, prompts.length)),
    }));
  };

  const updatePrompt = (idx: number, value: string) => {
    setForm(f => {
      const prompts = [...f.usage_proof_photo_prompts];
      prompts[idx] = value;
      return { ...f, usage_proof_photo_prompts: prompts };
    });
  };

  const handleWarrantyPhotoCountChange = (count: number) => {
    const prompts = [...form.warranty_old_part_photo_prompts];
    while (prompts.length < count) prompts.push('');
    setForm(f => ({
      ...f,
      warranty_old_part_photos_required_count: count,
      warranty_old_part_photo_prompts: prompts.slice(0, Math.max(count, prompts.length)),
    }));
  };

  const updateWarrantyPrompt = (idx: number, value: string) => {
    setForm(f => {
      const prompts = [...f.warranty_old_part_photo_prompts];
      prompts[idx] = value;
      return { ...f, warranty_old_part_photo_prompts: prompts };
    });
  };

  const handleGoodwillPhotoCountChange = (count: number) => {
    const prompts = [...form.goodwill_old_part_photo_prompts];
    while (prompts.length < count) prompts.push('');
    setForm(f => ({
      ...f,
      goodwill_old_part_photos_required_count: count,
      goodwill_old_part_photo_prompts: prompts.slice(0, Math.max(count, prompts.length)),
    }));
  };

  const updateGoodwillPrompt = (idx: number, value: string) => {
    setForm(f => {
      const prompts = [...f.goodwill_old_part_photo_prompts];
      prompts[idx] = value;
      return { ...f, goodwill_old_part_photo_prompts: prompts };
    });
  };

  const handleSavePart = async () => {
    if (!form.part_name.trim()) { toast.error('Part name is required'); return; }
    const finalPrompts = form.usage_proof_photo_prompts
      .slice(0, form.usage_proof_photos_required_count)
      .map((p, i) => p.trim() || `Photo ${i + 1}`);
    const finalWarrantyPrompts = form.warranty_old_part_photo_prompts
      .slice(0, form.warranty_old_part_photos_required_count)
      .map((p, i) => p.trim() || `Old part photo ${i + 1}`);
    const finalGoodwillPrompts = form.goodwill_old_part_photo_prompts
      .slice(0, form.goodwill_old_part_photos_required_count)
      .map((p, i) => p.trim() || `Old part photo ${i + 1}`);

    try {
      const payload = {
        part_name: form.part_name.trim(),
        part_code: form.part_code.trim() || null,
        active: form.active,
        serial_required: form.serial_required,
        old_part_srno_required: form.old_part_srno_required,
        max_qty_allowed: form.max_qty_allowed,
        usage_proof_photos_required_count: form.usage_proof_photos_required_count,
        usage_proof_photo_prompts: JSON.stringify(finalPrompts),
        warranty_available: form.warranty_available,
        goodwill_available: form.goodwill_available,
        warranty_approval_needed: form.warranty_approval_needed,
        goodwill_approval_needed: form.goodwill_approval_needed,
        warranty_old_part_photos_required_count: form.warranty_old_part_photos_required_count,
        warranty_old_part_photo_prompts: JSON.stringify(finalWarrantyPrompts),
        goodwill_old_part_photos_required_count: form.goodwill_old_part_photos_required_count,
        goodwill_old_part_photo_prompts: JSON.stringify(finalGoodwillPrompts),
      };

      if (editingPart) {
        const { error } = await supabase.from('spare_parts_master' as any)
          .update(payload as any)
          .eq('id', editingPart.id);
        if (error) throw error;
        toast.success('Part updated');
      } else {
        const { error } = await supabase.from('spare_parts_master' as any)
          .insert(payload as any);
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
    setAppModelIds([]);
    setAppColors(['ALL']);
    setShowAppDialog(true);
  };

  const handleAddApplicability = async () => {
    if (appModelIds.length === 0) { toast.error('Select at least one model'); return; }
    
    // Build list of color codes to insert
    const colorCodes = appColors.includes('ALL') ? [null] : appColors.map(c => c);
    
    let added = 0;
    let skipped = 0;

    try {
      for (const modelId of appModelIds) {
        for (const colorCode of colorCodes) {
          const exactDuplicate = applicability.find(a =>
            a.spare_part_id === appPartId &&
            a.vehicle_model_id === modelId &&
            ((colorCode === null && a.color_code === null) ||
             (colorCode !== null && a.color_code === colorCode))
          );
          if (exactDuplicate) { skipped++; continue; }

          const { error } = await supabase.from('spare_parts_applicability' as any)
            .insert({
              spare_part_id: appPartId,
              vehicle_model_id: modelId,
              color_code: colorCode,
            } as any);
          if (error) {
            if (error.message.includes('unique') || error.message.includes('duplicate')) {
              skipped++;
            } else throw error;
          } else {
            added++;
          }
        }
      }
      
      if (added > 0) toast.success(`${added} mapping${added > 1 ? 's' : ''} added${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}`);
      else toast.warning('All mappings already exist');
      
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

  // Filter logic
  const filteredParts = parts.filter(part => {
    const q = searchQuery.toLowerCase().trim();
    if (q && !part.part_name.toLowerCase().includes(q) && !(part.part_code || '').toLowerCase().includes(q)) return false;
    if (filterStatus === 'active' && !part.active) return false;
    if (filterStatus === 'inactive' && part.active) return false;
    if (filterModel !== 'all') {
      const partApps = getPartApplicability(part.id);
      if (!partApps.some(a => a.vehicle_model_id === filterModel)) return false;
    }
    return true;
  });

  const hasActiveFilters = filterModel !== 'all' || filterStatus !== 'all';

  return (
    <AppLayout>
      <PageHeader
        title="Spare Parts Master"
        showBack
        backTo="/console/system-config"
        rightAction={
          !isMobile ? (
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />Add Part
            </Button>
          ) : undefined
        }
      />

      {/* Search & Filters */}
      <div className="px-4 pt-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search parts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={hasActiveFilters ? 'default' : 'outline'}
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterModel} onValueChange={setFilterModel}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {models.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterModel('all'); setFilterStatus('all'); }}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 pb-24">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40" /></CardContent></Card>
          ))
        ) : filteredParts.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{parts.length === 0 ? 'No spare parts yet' : 'No parts match your search'}</p>
          </CardContent></Card>
        ) : (
          filteredParts.map(part => {
            const partApps = getPartApplicability(part.id);
            const p = part as any;
            const isExpanded = expandedPart === part.id;
            return (
              <Collapsible
                key={part.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedPart(open ? part.id : null)}
              >
                <Card className={!part.active ? 'opacity-60' : ''}>
                  <CardContent className="p-3 sm:p-4">
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-sm line-clamp-1">{part.part_name}</span>
                            {part.part_code && (
                              <span className="text-xs text-muted-foreground block sm:inline sm:ml-1">({part.part_code})</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!part.active && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                          {(!isMobile || isExpanded) && (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">{partApps.length} model{partApps.length !== 1 ? 's' : ''}</Badge>
                          )}
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      {(!isMobile || isExpanded) && (
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {part.serial_required && <Badge variant="outline" className="text-[10px]">Serial# Req</Badge>}
                          {part.old_part_srno_required && <Badge variant="outline" className="text-[10px]">Old Serial# Req</Badge>}
                          {part.usage_proof_photos_required_count > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {part.usage_proof_photos_required_count} Proof Photo{part.usage_proof_photos_required_count > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {part.warranty_available && (
                            <Badge variant="outline" className="text-[10px]">
                              Warranty{p.warranty_approval_needed === false ? '' : ' + Approval'}
                            </Badge>
                          )}
                          {part.goodwill_available && (
                            <Badge variant="outline" className="text-[10px]">
                              Goodwill{p.goodwill_approval_needed === false ? '' : ' + Approval'}
                            </Badge>
                          )}
                        </div>
                      )}
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

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={openAddDialog}
          className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Add/Edit Part Dialog — Sectioned Layout */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPart ? 'Edit Part' : 'Add Spare Part'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 py-2">
            {/* ── GENERAL ── */}
            <SectionCard title="General">
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
                {editingPart && (
                  <div className="flex items-center gap-2 self-end pb-1">
                    <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                    <Label className="text-sm">Active</Label>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── USAGE / EVIDENCE ── */}
            <SectionCard title="Usage & Evidence">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Part Serial Number Required</Label>
                <Switch checked={form.serial_required} onCheckedChange={v => setForm(f => ({ ...f, serial_required: v }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">New Part Proof Photos (count)</Label>
                <Input type="number" min={0} value={form.usage_proof_photos_required_count} onChange={e => handleProofCountChange(parseInt(e.target.value) || 0)} className="h-8" />
              </div>
              {form.usage_proof_photos_required_count > 0 && (
                <div className="space-y-1.5 pl-3 border-l-2 border-muted">
                  <Label className="text-xs text-muted-foreground">Photo Prompts</Label>
                  {Array.from({ length: form.usage_proof_photos_required_count }).map((_, idx) => (
                    <Input
                      key={idx}
                      placeholder={`Prompt for photo ${idx + 1}`}
                      value={form.usage_proof_photo_prompts[idx] || ''}
                      onChange={e => updatePrompt(idx, e.target.value)}
                      className="h-7 text-xs"
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ── WARRANTY ── */}
            <SectionCard title="Warranty">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Warranty Available</Label>
                <Switch checked={form.warranty_available} onCheckedChange={v => setForm(f => ({ ...f, warranty_available: v }))} />
              </div>
              {form.warranty_available && (
                <div className="space-y-3 pl-3 border-l-2 border-muted">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Approval Needed</Label>
                    <Switch checked={form.warranty_approval_needed} onCheckedChange={v => setForm(f => ({ ...f, warranty_approval_needed: v }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Old Part Serial Number Required</Label>
                    <Switch checked={form.old_part_srno_required} onCheckedChange={v => setForm(f => ({ ...f, old_part_srno_required: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Old Part Photos (count)</Label>
                    <Input
                      type="number" min={0} max={10}
                      value={form.warranty_old_part_photos_required_count}
                      onChange={e => handleWarrantyPhotoCountChange(parseInt(e.target.value) || 0)}
                      className="h-8"
                    />
                  </div>
                  {form.warranty_old_part_photos_required_count > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Photo Prompts</Label>
                      {Array.from({ length: form.warranty_old_part_photos_required_count }).map((_, idx) => (
                        <Input
                          key={idx}
                          placeholder={`Prompt for photo ${idx + 1}`}
                          value={form.warranty_old_part_photo_prompts[idx] || ''}
                          onChange={e => updateWarrantyPrompt(idx, e.target.value)}
                          className="h-7 text-xs"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── GOODWILL ── */}
            <SectionCard title="Goodwill">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Goodwill Available</Label>
                <Switch checked={form.goodwill_available} onCheckedChange={v => setForm(f => ({ ...f, goodwill_available: v }))} />
              </div>
              {form.goodwill_available && (
                <div className="space-y-3 pl-3 border-l-2 border-muted">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Approval Needed</Label>
                    <Switch checked={form.goodwill_approval_needed} onCheckedChange={v => setForm(f => ({ ...f, goodwill_approval_needed: v }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Old Part Serial Number Required</Label>
                    <Switch checked={form.old_part_srno_required} onCheckedChange={v => setForm(f => ({ ...f, old_part_srno_required: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Old Part Photos (count)</Label>
                    <Input
                      type="number" min={0} max={10}
                      value={form.goodwill_old_part_photos_required_count}
                      onChange={e => handleGoodwillPhotoCountChange(parseInt(e.target.value) || 0)}
                      className="h-8"
                    />
                  </div>
                  {form.goodwill_old_part_photos_required_count > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Photo Prompts</Label>
                      {Array.from({ length: form.goodwill_old_part_photos_required_count }).map((_, idx) => (
                        <Input
                          key={idx}
                          placeholder={`Prompt for photo ${idx + 1}`}
                          value={form.goodwill_old_part_photo_prompts[idx] || ''}
                          onChange={e => updateGoodwillPrompt(idx, e.target.value)}
                          className="h-7 text-xs"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSavePart}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicability Dialog — Multi-select */}
      <Dialog open={showAppDialog} onOpenChange={setShowAppDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Model Mapping</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Vehicle Models *</Label>
              <div className="rounded-md border bg-background max-h-48 overflow-y-auto p-1">
                {models.map(m => {
                  const checked = appModelIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAppModelIds(prev =>
                            checked ? prev.filter(id => id !== m.id) : [...prev, m.id]
                          )
                        }
                        className="rounded border-input"
                      />
                      {m.name}
                    </label>
                  );
                })}
              </div>
              {appModelIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{appModelIds.length} selected</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Colors</Label>
              <div className="rounded-md border bg-background p-1">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={appColors.includes('ALL')}
                    onChange={() => setAppColors(['ALL'])}
                    className="rounded border-input"
                  />
                  All Colors
                </label>
                {COLOR_OPTIONS.map(c => {
                  const checked = appColors.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            const next = appColors.filter(x => x !== c);
                            setAppColors(next.length === 0 ? ['ALL'] : next);
                          } else {
                            setAppColors(prev => [...prev.filter(x => x !== 'ALL'), c]);
                          }
                        }}
                        className="rounded border-input"
                      />
                      {c}
                    </label>
                  );
                })}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAppDialog(false)}>Cancel</Button>
            <Button onClick={handleAddApplicability}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
