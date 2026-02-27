import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, ChevronDown, Pencil, Trash2, ListTree, X, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ServiceCategory } from '@/types';

export default function ManageServiceCategoriesPage() {
  const { profile } = useAuth();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Add category flow (multi-step: name then issues)
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIssues, setNewCategoryIssues] = useState<{ name: string; requires_spares: boolean }[]>([]);
  const [newIssueDraft, setNewIssueDraft] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // Inline add issue to existing category
  const [addingIssueFor, setAddingIssueFor] = useState<string | null>(null);
  const [newIssueName, setNewIssueName] = useState('');
  const [newIssueRequiresSpares, setNewIssueRequiresSpares] = useState(false);

  // Edit
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; parent_code: string | null; requires_spares: boolean } | null>(null);
  const [editName, setEditName] = useState('');
  const [editRequiresSpares, setEditRequiresSpares] = useState(false);

  // Delete
  const [deletingItem, setDeletingItem] = useState<ServiceCategory | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      setCategories((data || []) as ServiceCategory[]);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const parentCategories = categories.filter((c) => !c.parent_code);
  const getIssues = (parentCode: string) => categories.filter((c) => c.parent_code === parentCode);

  // ---- Add Category (with mandatory issues) ----
  const addIssueToNewCategory = () => {
    if (!newIssueDraft.trim()) return;
    setNewCategoryIssues(prev => [...prev, { name: newIssueDraft.trim(), requires_spares: false }]);
    setNewIssueDraft('');
  };

  const removeIssueFromNew = (idx: number) => {
    setNewCategoryIssues(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleNewIssueSpares = (idx: number) => {
    setNewCategoryIssues(prev => prev.map((iss, i) => i === idx ? { ...iss, requires_spares: !iss.requires_spares } : iss));
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) { toast.error('Category name is required'); return; }
    if (newCategoryIssues.length === 0) { toast.error('Add at least 1 issue before saving'); return; }
    setAddingCategory(true);
    try {
      const catCode = newCategoryName.trim().toUpperCase().replace(/\s+/g, '_');
      const maxOrder = Math.max(0, ...parentCategories.map((c) => c.sort_order || 0));

      // Insert category (trigger forces requires_spares=false)
      const { error: catErr } = await supabase.from('service_categories').insert({
        code: catCode,
        name: newCategoryName.trim(),
        parent_code: null,
        sort_order: maxOrder + 1,
        requires_spares: false,
      } as any);
      if (catErr) throw catErr;

      // Insert issues
      for (let i = 0; i < newCategoryIssues.length; i++) {
        const iss = newCategoryIssues[i];
        const issCode = `${catCode}_${iss.name.toUpperCase().replace(/\s+/g, '_')}`;
        const { error: issErr } = await supabase.from('service_categories').insert({
          code: issCode,
          name: iss.name,
          parent_code: catCode,
          sort_order: i + 1,
          requires_spares: iss.requires_spares,
        } as any);
        if (issErr) throw issErr;
      }

      toast.success('Category created with issues');
      setNewCategoryName('');
      setNewCategoryIssues([]);
      setNewIssueDraft('');
      setShowAddCategory(false);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  };

  // ---- Add issue to existing category ----
  const handleAddIssue = async (parentCode: string) => {
    if (!newIssueName.trim()) return;
    try {
      const issues = getIssues(parentCode);
      const code = `${parentCode}_${newIssueName.trim().toUpperCase().replace(/\s+/g, '_')}`;
      const maxOrder = Math.max(0, ...issues.map((i) => i.sort_order || 0));
      const { error } = await supabase.from('service_categories').insert({
        code,
        name: newIssueName.trim(),
        parent_code: parentCode,
        sort_order: maxOrder + 1,
        requires_spares: newIssueRequiresSpares,
      } as any);
      if (error) throw error;
      toast.success('Issue added');
      setNewIssueName('');
      setNewIssueRequiresSpares(false);
      setAddingIssueFor(null);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add issue');
    }
  };

  // ---- Edit ----
  const handleEditSave = async () => {
    if (!editingItem || !editName.trim()) return;
    try {
      const updatePayload: any = { name: editName.trim() };
      // Only allow requires_spares on issue rows (parent_code != null)
      if (editingItem.parent_code) {
        updatePayload.requires_spares = editRequiresSpares;
      }
      const { error } = await supabase
        .from('service_categories')
        .update(updatePayload as any)
        .eq('id', editingItem.id);
      if (error) throw error;
      toast.success('Updated');
      setEditingItem(null);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    }
  };

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      if (!deletingItem.parent_code) {
        await supabase
          .from('service_categories')
          .update({ is_active: false } as any)
          .eq('parent_code', deletingItem.code);
      }
      const { error } = await supabase
        .from('service_categories')
        .update({ is_active: false } as any)
        .eq('id', deletingItem.id);
      if (error) throw error;
      toast.success('Removed');
      setDeletingItem(null);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    }
  };

  if (!isSuperAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4"><Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Super Admin access required.</p></CardContent></Card></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Service Categories"
        showBack
        backTo="/console/system-config"
        rightAction={
          <Button size="sm" onClick={() => setShowAddCategory(true)}>
            <Plus className="h-4 w-4 mr-1" />Category
          </Button>
        }
      />
      <div className="p-4 space-y-3">
        {/* Add Category flow */}
        {showAddCategory && (
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Category Name *</Label>
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Issues (at least 1 required) *</Label>
                {newCategoryIssues.map((iss, idx) => (
                  <div key={idx} className="flex items-center gap-2 pl-3 py-1 bg-muted/50 rounded">
                    <span className="text-sm flex-1">{iss.name}</span>
                    {iss.requires_spares && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Package className="h-2.5 w-2.5" />Spares
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={() => toggleNewIssueSpares(idx)}>
                      <Package className={`h-3 w-3 ${iss.requires_spares ? 'text-primary' : 'text-muted-foreground'}`} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeIssueFromNew(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1 items-center pl-3">
                  <Input
                    placeholder="Issue name"
                    value={newIssueDraft}
                    onChange={(e) => setNewIssueDraft(e.target.value)}
                    className="h-7 text-sm flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addIssueToNewCategory()}
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addIssueToNewCategory}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryIssues([]); setNewIssueDraft(''); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddCategory} disabled={addingCategory}>
                  Save Category
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40" /></CardContent></Card>
          ))
        ) : parentCategories.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <ListTree className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No categories yet</p>
          </CardContent></Card>
        ) : (
          parentCategories.map((cat) => {
            const issues = getIssues(cat.code);
            return (
              <Collapsible key={cat.id} open={expandedCat === cat.id} onOpenChange={(open) => setExpandedCat(open ? cat.id : null)}>
                <Card>
                  <CardContent className="p-4">
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ListTree className="h-4 w-4 text-muted-foreground" />
                          {editingItem?.id === cat.id ? (
                            <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm w-40" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleEditSave()} />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleEditSave}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingItem(null)}><X className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <span className="font-medium text-sm">{cat.name}</span>
                          )}
                          <span className="text-xs text-muted-foreground">({issues.length})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {editingItem?.id !== cat.id && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => {
                                e.stopPropagation();
                                setEditingItem({ id: cat.id, name: cat.name, parent_code: null, requires_spares: false });
                                setEditName(cat.name);
                                setEditRequiresSpares(false);
                              }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingItem(cat); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedCat === cat.id ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {issues.map((issue) => (
                          <div key={issue.id} className="flex items-center justify-between pl-6 py-1">
                            {editingItem?.id === issue.id ? (
                              <div className="flex gap-1 items-center flex-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm flex-1 min-w-[120px]" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleEditSave()} />
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={editRequiresSpares}
                                    onCheckedChange={setEditRequiresSpares}
                                    className="scale-75"
                                  />
                                  <span className="text-[10px] text-muted-foreground">Spares</span>
                                </div>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleEditSave}><Check className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingItem(null)}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{issue.name}</span>
                                  {issue.requires_spares && (
                                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                                      <Package className="h-2.5 w-2.5" />Spares
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                                    setEditingItem({ id: issue.id, name: issue.name, parent_code: issue.parent_code, requires_spares: issue.requires_spares });
                                    setEditName(issue.name);
                                    setEditRequiresSpares(issue.requires_spares);
                                  }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeletingItem(issue)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                        {addingIssueFor === cat.code ? (
                          <div className="pl-6 space-y-1">
                            <div className="flex gap-1 items-center">
                              <Input placeholder="Issue name" value={newIssueName} onChange={(e) => setNewIssueName(e.target.value)} className="h-7 text-sm flex-1" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAddIssue(cat.code)} />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAddIssue(cat.code)}><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setAddingIssueFor(null); setNewIssueName(''); setNewIssueRequiresSpares(false); }}><X className="h-3 w-3" /></Button>
                            </div>
                            <div className="flex items-center gap-2 pl-1">
                              <Switch
                                id="new-issue-requires-spares"
                                checked={newIssueRequiresSpares}
                                onCheckedChange={setNewIssueRequiresSpares}
                                className="scale-75"
                              />
                              <Label htmlFor="new-issue-requires-spares" className="text-[10px] text-muted-foreground cursor-pointer">
                                Requires Spares
                              </Label>
                            </div>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs ml-6" onClick={() => setAddingIssueFor(cat.code)}>
                            <Plus className="h-3 w-3 mr-1" />Add Issue
                          </Button>
                        )}
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            );
          })
        )}
      </div>

      <ConfirmationDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
        title={deletingItem?.parent_code ? 'Remove Issue' : 'Remove Category'}
        description={deletingItem ? `Remove "${deletingItem.name}"?${!deletingItem.parent_code ? ' All issues under this category will also be removed.' : ''}` : ''}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </AppLayout>
  );
}