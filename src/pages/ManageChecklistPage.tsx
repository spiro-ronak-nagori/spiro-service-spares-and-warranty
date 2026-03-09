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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Plus, Pencil, Trash2, ClipboardCheck, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { useVehicleModels } from '@/hooks/useVehicleModels';
import { useCountries } from '@/hooks/useCountries';
import { toast } from 'sonner';

interface ChecklistTemplate {
  id: string;
  name: string;
  is_active: boolean;
  is_global: boolean;
  country_ids: string[];
  workshop_ids: string[];
  created_at: string;
  updated_at: string;
}

interface ChecklistItem {
  id: string;
  template_id: string;
  label: string;
  response_type: 'none' | 'text' | 'photo' | 'text_photo';
  is_mandatory: boolean;
  is_active: boolean;
  sort_order: number;
  photo_count: number;
  photo_prompts: string[];
}

interface Applicability {
  id: string;
  template_id: string;
  vehicle_model_id: string;
}

interface Workshop {
  id: string;
  name: string;
  country: string | null;
}

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  none: 'Completion Only',
  text: 'Text Input',
  photo: 'Photo Capture',
  text_photo: 'Text + Photo',
};

export default function ManageChecklistPage() {
  const { profile } = useAuth();
  const { models } = useVehicleModels();
  const { countries } = useCountries();

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({});
  const [applicability, setApplicability] = useState<Record<string, Applicability[]>>({});

  // Template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateIsGlobal, setTemplateIsGlobal] = useState(false);
  const [templateCountryIds, setTemplateCountryIds] = useState<string[]>([]);
  const [templateWorkshopIds, setTemplateWorkshopIds] = useState<string[]>([]);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Item dialog
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [itemTemplateId, setItemTemplateId] = useState('');
  const [itemLabel, setItemLabel] = useState('');
  const [itemResponseType, setItemResponseType] = useState<string>('none');
  const [itemMandatory, setItemMandatory] = useState(true);
  const [itemPhotoCount, setItemPhotoCount] = useState(1);
  const [itemPhotoPrompts, setItemPhotoPrompts] = useState<string[]>(['']);
  const [itemSaving, setItemSaving] = useState(false);

  // Delete
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const hasAccess = profile?.role === 'system_admin' || profile?.role === 'super_admin';

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('checklist_templates' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(((data as any[]) || []).map((t: any) => ({
        ...t,
        country_ids: t.country_ids || [],
        workshop_ids: t.workshop_ids || [],
        is_global: t.is_global || false,
      })));
    } catch (err) {
      console.error('Failed to fetch checklist templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    // Load workshops for scoping
    (async () => {
      const { data } = await supabase.from('workshops').select('id, name, country').order('name');
      setWorkshops((data || []) as Workshop[]);
    })();
  }, [fetchTemplates]);

  const fetchItems = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('checklist_template_items' as any)
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order');
      if (error) throw error;
      setItems(prev => ({
        ...prev,
        [templateId]: ((data as any[]) || []).map((i: any) => ({
          ...i,
          photo_count: i.photo_count || 1,
          photo_prompts: Array.isArray(i.photo_prompts) ? i.photo_prompts : [],
        })),
      }));
    } catch (err) {
      console.error('Failed to fetch checklist items:', err);
    }
  };

  const fetchApplicability = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('checklist_template_applicability' as any)
        .select('*')
        .eq('template_id', templateId);
      if (error) throw error;
      setApplicability(prev => ({ ...prev, [templateId]: (data as any[]) || [] }));
    } catch (err) {
      console.error('Failed to fetch applicability:', err);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!items[id]) fetchItems(id);
      if (!applicability[id]) fetchApplicability(id);
    }
  };

  // Template CRUD
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateIsGlobal(false);
    setTemplateCountryIds([]);
    setTemplateWorkshopIds([]);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: ChecklistTemplate) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateIsGlobal(t.is_global);
    setTemplateCountryIds(t.country_ids);
    setTemplateWorkshopIds(t.workshop_ids);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    if (!templateIsGlobal && templateCountryIds.length === 0 && templateWorkshopIds.length === 0) {
      toast.error('Enable Global or select at least one country/workshop');
      return;
    }
    setTemplateSaving(true);
    try {
      const payload = {
        name: templateName.trim(),
        is_global: templateIsGlobal,
        country_ids: templateCountryIds,
        workshop_ids: templateWorkshopIds,
        updated_at: new Date().toISOString(),
      };
      if (editingTemplate) {
        const { error } = await supabase
          .from('checklist_templates' as any)
          .update(payload as any)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase
          .from('checklist_templates' as any)
          .insert(payload as any);
        if (error) throw error;
        toast.success('Template created');
      }
      setShowTemplateDialog(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const toggleTemplateActive = async (t: ChecklistTemplate) => {
    try {
      const { error } = await supabase
        .from('checklist_templates' as any)
        .update({ is_active: !t.is_active, updated_at: new Date().toISOString() } as any)
        .eq('id', t.id);
      if (error) throw error;
      toast.success(`Template ${!t.is_active ? 'activated' : 'deactivated'}`);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template');
    }
  };

  // Item CRUD
  const needsPhotos = (type: string) => type === 'photo' || type === 'text_photo';

  const openNewItem = (templateId: string) => {
    setEditingItem(null);
    setItemTemplateId(templateId);
    setItemLabel('');
    setItemResponseType('none');
    setItemMandatory(true);
    setItemPhotoCount(1);
    setItemPhotoPrompts(['']);
    setShowItemDialog(true);
  };

  const openEditItem = (item: ChecklistItem) => {
    setEditingItem(item);
    setItemTemplateId(item.template_id);
    setItemLabel(item.label);
    setItemResponseType(item.response_type);
    setItemMandatory(item.is_mandatory);
    const count = Math.max(item.photo_count, 1);
    setItemPhotoCount(count);
    const prompts = Array.isArray(item.photo_prompts) ? item.photo_prompts : [];
    // Pad prompts to match count
    setItemPhotoPrompts(Array.from({ length: count }, (_, i) => prompts[i] || ''));
    setShowItemDialog(true);
  };

  const handlePhotoCountChange = (count: number) => {
    const c = Math.max(1, Math.min(count, 5));
    setItemPhotoCount(c);
    setItemPhotoPrompts(prev => {
      const next = Array.from({ length: c }, (_, i) => prev[i] || '');
      return next;
    });
  };

  const handlePhotoPromptChange = (idx: number, val: string) => {
    setItemPhotoPrompts(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const saveItem = async () => {
    if (!itemLabel.trim()) return;
    setItemSaving(true);
    try {
      const hasPhotos = needsPhotos(itemResponseType);
      const payload: any = {
        label: itemLabel.trim(),
        response_type: itemResponseType,
        is_mandatory: itemMandatory,
        photo_count: hasPhotos ? itemPhotoCount : 1,
        photo_prompts: hasPhotos ? itemPhotoPrompts.map(p => p.trim()) : [],
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('checklist_template_items' as any)
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Item updated');
      } else {
        const currentItems = items[itemTemplateId] || [];
        const nextSort = currentItems.length > 0
          ? Math.max(...currentItems.map(i => i.sort_order)) + 1
          : 0;
        const { error } = await supabase
          .from('checklist_template_items' as any)
          .insert({ ...payload, template_id: itemTemplateId, sort_order: nextSort });
        if (error) throw error;
        toast.success('Item added');
      }
      setShowItemDialog(false);
      fetchItems(itemTemplateId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item');
    } finally {
      setItemSaving(false);
    }
  };

  const toggleItemActive = async (item: ChecklistItem) => {
    try {
      const { error } = await supabase
        .from('checklist_template_items' as any)
        .update({ is_active: !item.is_active, updated_at: new Date().toISOString() } as any)
        .eq('id', item.id);
      if (error) throw error;
      fetchItems(item.template_id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update item');
    }
  };

  const deleteItem = async () => {
    if (!deletingItemId) return;
    const item = Object.values(items).flat().find(i => i.id === deletingItemId);
    try {
      const { error } = await supabase
        .from('checklist_template_items' as any)
        .delete()
        .eq('id', deletingItemId);
      if (error) throw error;
      toast.success('Item deleted');
      if (item) fetchItems(item.template_id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete item');
    } finally {
      setDeletingItemId(null);
    }
  };

  const moveItem = async (item: ChecklistItem, direction: 'up' | 'down') => {
    const templateItems = items[item.template_id] || [];
    const idx = templateItems.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= templateItems.length) return;
    const other = templateItems[swapIdx];
    try {
      await Promise.all([
        supabase.from('checklist_template_items' as any).update({ sort_order: other.sort_order } as any).eq('id', item.id),
        supabase.from('checklist_template_items' as any).update({ sort_order: item.sort_order } as any).eq('id', other.id),
      ]);
      fetchItems(item.template_id);
    } catch {
      toast.error('Failed to reorder');
    }
  };

  // Applicability
  const toggleModelApplicability = async (templateId: string, modelId: string) => {
    const current = applicability[templateId] || [];
    const existing = current.find(a => a.vehicle_model_id === modelId);
    try {
      if (existing) {
        const { error } = await supabase.from('checklist_template_applicability' as any).delete().eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('checklist_template_applicability' as any).insert({ template_id: templateId, vehicle_model_id: modelId } as any);
        if (error) throw error;
      }
      fetchApplicability(templateId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update applicability');
    }
  };

  // Helpers
  const getScopeLabel = (t: ChecklistTemplate) => {
    const parts: string[] = [];
    if (t.is_global) parts.push('Global');
    if (t.country_ids.length > 0) {
      const names = t.country_ids.map(id => countries.find(c => c.name === id)?.name || id);
      parts.push(names.join(', '));
    }
    if (t.workshop_ids.length > 0) {
      const names = t.workshop_ids.map(id => workshops.find(w => w.id === id)?.name || id.slice(0, 8));
      parts.push(names.join(', '));
    }
    return parts.join(' · ') || 'No scope';
  };

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console/system-config" />
        <div className="p-4"><Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Access required.</p></CardContent></Card></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Vehicle Checklist" showBack backTo="/console/system-config" />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground flex-1">Configure checklist templates, items, and applicability.</p>
          <Button size="sm" className="shrink-0" onClick={openNewTemplate}>
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        </div>

        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-64" /></CardContent></Card>
          ))
        ) : templates.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><ClipboardCheck className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No checklist templates yet</p></CardContent></Card>
        ) : (
          templates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(t.id)}>
                    {expandedId === t.id ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium break-words">{t.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] h-5">
                          {t.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {t.is_global && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            <Globe className="h-2.5 w-2.5 mr-0.5" />Global
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                          {getScopeLabel(t)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={t.is_active} onCheckedChange={() => toggleTemplateActive(t)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTemplate(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === t.id && (
                  <div className="mt-4 space-y-4">
                    <Separator />

                    {/* Items */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Checklist Items</h4>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openNewItem(t.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Add Item
                        </Button>
                      </div>
                      {(items[t.id] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No items yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {(items[t.id] || []).map((item, idx) => (
                            <div key={item.id} className={`rounded-lg border p-3 text-sm ${!item.is_active ? 'opacity-50' : ''}`}>
                              <div className="flex items-start gap-2">
                                <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                                  <button onClick={() => moveItem(item, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => moveItem(item, 'down')} disabled={idx === (items[t.id] || []).length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium break-words leading-snug">{item.label}</p>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <Badge variant="outline" className="text-[10px] h-5 shrink-0">{RESPONSE_TYPE_LABELS[item.response_type]}</Badge>
                                    {item.is_mandatory && <Badge variant="destructive" className="text-[10px] h-5 shrink-0">Required</Badge>}
                                    {needsPhotos(item.response_type) && item.photo_count > 1 && (
                                      <Badge variant="secondary" className="text-[10px] h-5 shrink-0">{item.photo_count} photos</Badge>
                                    )}
                                  </div>
                                  {needsPhotos(item.response_type) && item.photo_prompts.filter(Boolean).length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {item.photo_prompts.filter(Boolean).map((p, i) => (
                                        <p key={i} className="text-[10px] text-muted-foreground italic truncate">📷 {p}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Switch checked={item.is_active} onCheckedChange={() => toggleItemActive(item)} />
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(item)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingItemId(item.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Applicability */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vehicle Model Applicability</h4>
                      <p className="text-xs text-muted-foreground mb-2">Optionally narrow to specific vehicle models. If none selected, applies to all models within the scope above.</p>
                      <div className="flex flex-wrap gap-2">
                        {models.map(m => {
                          const isApplied = (applicability[t.id] || []).some(a => a.vehicle_model_id === m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleModelApplicability(t.id, m.id)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                isApplied
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                              }`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Checklist Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Standard Intake Checklist" className="mt-1" />
            </div>

            <Separator />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</h4>

            <div className="flex items-center gap-3">
              <Switch id="tpl-global" checked={templateIsGlobal} onCheckedChange={setTemplateIsGlobal} />
              <Label htmlFor="tpl-global" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Global (applies everywhere)
              </Label>
            </div>

            {!templateIsGlobal && (
              <>
                <div>
                  <Label className="text-xs">Countries</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {countries.map(c => {
                      const selected = templateCountryIds.includes(c.name);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTemplateCountryIds(prev =>
                            selected ? prev.filter(x => x !== c.name) : [...prev, c.name]
                          )}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            selected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Workshops</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5 max-h-40 overflow-y-auto">
                    {workshops
                      .filter(w => templateCountryIds.length === 0 || (w.country && templateCountryIds.includes(w.country)))
                      .map(w => {
                        const selected = templateWorkshopIds.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setTemplateWorkshopIds(prev =>
                              selected ? prev.filter(x => x !== w.id) : [...prev, w.id]
                            )}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              selected
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                            }`}
                          >
                            {w.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={templateSaving || !templateName.trim()}>
              {templateSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Checklist Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Item Label</Label>
              <Input value={itemLabel} onChange={e => setItemLabel(e.target.value)} placeholder="e.g. Front brake condition" className="mt-1" />
            </div>
            <div>
              <Label>Response Type</Label>
              <Select value={itemResponseType} onValueChange={v => {
                setItemResponseType(v);
                if (!needsPhotos(v)) {
                  setItemPhotoCount(1);
                  setItemPhotoPrompts(['']);
                }
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Completion Only</SelectItem>
                  <SelectItem value="text">Text Input</SelectItem>
                  <SelectItem value="photo">Photo Capture</SelectItem>
                  <SelectItem value="text_photo">Text + Photo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsPhotos(itemResponseType) && (
              <>
                <Separator />
                <div>
                  <Label>Number of Photo Slots</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={itemPhotoCount}
                    onChange={e => handlePhotoCountChange(parseInt(e.target.value) || 1)}
                    className="mt-1 w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Photo Prompts / Help Text</Label>
                  {itemPhotoPrompts.map((prompt, idx) => (
                    <div key={idx}>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Slot {idx + 1}</p>
                      <Input
                        value={prompt}
                        onChange={e => handlePhotoPromptChange(idx, e.target.value)}
                        placeholder={`e.g. Close-up of ${idx === 0 ? 'component' : 'damage area'}`}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center gap-3">
              <Switch id="item-mandatory" checked={itemMandatory} onCheckedChange={setItemMandatory} />
              <Label htmlFor="item-mandatory">Mandatory</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancel</Button>
            <Button onClick={saveItem} disabled={itemSaving || !itemLabel.trim()}>
              {itemSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <ConfirmationDialog
        open={!!deletingItemId}
        onOpenChange={(open) => { if (!open) setDeletingItemId(null); }}
        title="Delete Checklist Item"
        description="Are you sure? This item will be permanently removed from the template."
        onConfirm={deleteItem}
        confirmLabel="Delete"
        variant="destructive"
      />
    </AppLayout>
  );
}
