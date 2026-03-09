import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Plus, Pencil, Trash2, GripVertical, ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useVehicleModels } from '@/hooks/useVehicleModels';
import { toast } from 'sonner';

interface ChecklistTemplate {
  id: string;
  name: string;
  is_active: boolean;
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
}

interface Applicability {
  id: string;
  template_id: string;
  vehicle_model_id: string;
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

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({});
  const [applicability, setApplicability] = useState<Record<string, Applicability[]>>({});

  // Template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  // Item dialog
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [itemTemplateId, setItemTemplateId] = useState('');
  const [itemLabel, setItemLabel] = useState('');
  const [itemResponseType, setItemResponseType] = useState<string>('none');
  const [itemMandatory, setItemMandatory] = useState(true);
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
      setTemplates((data as any[]) || []);
    } catch (err) {
      console.error('Failed to fetch checklist templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const fetchItems = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('checklist_template_items' as any)
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order');
      if (error) throw error;
      setItems(prev => ({ ...prev, [templateId]: (data as any[]) || [] }));
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
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: ChecklistTemplate) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('checklist_templates' as any)
          .update({ name: templateName.trim(), updated_at: new Date().toISOString() } as any)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase
          .from('checklist_templates' as any)
          .insert({ name: templateName.trim() } as any);
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
  const openNewItem = (templateId: string) => {
    setEditingItem(null);
    setItemTemplateId(templateId);
    setItemLabel('');
    setItemResponseType('none');
    setItemMandatory(true);
    setShowItemDialog(true);
  };

  const openEditItem = (item: ChecklistItem) => {
    setEditingItem(item);
    setItemTemplateId(item.template_id);
    setItemLabel(item.label);
    setItemResponseType(item.response_type);
    setItemMandatory(item.is_mandatory);
    setShowItemDialog(true);
  };

  const saveItem = async () => {
    if (!itemLabel.trim()) return;
    setItemSaving(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('checklist_template_items' as any)
          .update({
            label: itemLabel.trim(),
            response_type: itemResponseType,
            is_mandatory: itemMandatory,
            updated_at: new Date().toISOString(),
          } as any)
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
          .insert({
            template_id: itemTemplateId,
            label: itemLabel.trim(),
            response_type: itemResponseType,
            is_mandatory: itemMandatory,
            sort_order: nextSort,
          } as any);
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
    } catch (err: any) {
      toast.error('Failed to reorder');
    }
  };

  // Applicability
  const toggleModelApplicability = async (templateId: string, modelId: string) => {
    const current = applicability[templateId] || [];
    const existing = current.find(a => a.vehicle_model_id === modelId);
    try {
      if (existing) {
        const { error } = await supabase
          .from('checklist_template_applicability' as any)
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('checklist_template_applicability' as any)
          .insert({ template_id: templateId, vehicle_model_id: modelId } as any);
        if (error) throw error;
      }
      fetchApplicability(templateId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update applicability');
    }
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Configure checklist templates, items, and vehicle model mappings.</p>
          <Button size="sm" onClick={openNewTemplate}>
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
                      <h3 className="text-sm font-medium truncate">{t.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] h-5">
                          {t.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {(items[t.id] || []).filter(i => i.is_active).length} items
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
                        <p className="text-xs text-muted-foreground py-2">No items yet. Add checklist items above.</p>
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
                                  </div>
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
                      <p className="text-xs text-muted-foreground mb-2">Select which vehicle models this checklist applies to. If none selected, it applies to all models.</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Checklist Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Standard Intake Checklist" className="mt-1" />
            </div>
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
        <DialogContent>
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
              <Select value={itemResponseType} onValueChange={setItemResponseType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Completion Only</SelectItem>
                  <SelectItem value="text">Text Input</SelectItem>
                  <SelectItem value="photo">Photo Capture</SelectItem>
                  <SelectItem value="text_photo">Text + Photo</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
