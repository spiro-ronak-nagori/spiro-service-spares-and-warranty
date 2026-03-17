import { useState, useEffect } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceCategory } from '@/types';

interface EditIssuesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentServiceCategories: string[];
  currentIssueCategories: string[];
  onSave: (serviceCategories: string[], issueCategories: string[]) => void;
  isSaving?: boolean;
}

export function EditIssuesSheet({
  open,
  onOpenChange,
  currentServiceCategories,
  currentIssueCategories,
  onSave,
  isSaving = false,
}: EditIssuesSheetProps) {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedL1, setSelectedL1] = useState<Set<string>>(new Set());
  const [selectedL2, setSelectedL2] = useState<Set<string>>(new Set());
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
      setSelectedL1(new Set(currentServiceCategories));
      setSelectedL2(new Set(currentIssueCategories));
    }
  }, [open, currentServiceCategories, currentIssueCategories]);

  const fetchCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const l1Categories = categories.filter(c => !c.parent_code);
  const getL2Categories = (parentCode: string) =>
    categories.filter(c => c.parent_code === parentCode);

  const toggleL1 = (code: string) => {
    const newL1 = new Set(selectedL1);
    if (newL1.has(code)) {
      newL1.delete(code);
      const newL2 = new Set(selectedL2);
      getL2Categories(code).forEach(c => newL2.delete(c.code));
      setSelectedL2(newL2);
    } else {
      newL1.add(code);
    }
    setSelectedL1(newL1);
  };

  const toggleL2 = (code: string) => {
    const newL2 = new Set(selectedL2);
    if (newL2.has(code)) {
      newL2.delete(code);
    } else {
      newL2.add(code);
    }
    setSelectedL2(newL2);
  };

  const hasSelection = selectedL2.size > 0;

  const handleSave = () => {
    if (hasSelection) {
      onSave(
        Array.from(selectedL1),
        Array.from(selectedL2),
      );
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>Edit Service Details</DrawerTitle>
          <DrawerDescription>
            Update service issues{showMechanicFields ? ' and mechanic' : ''} for this job card
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto flex-1 min-h-0">
          {isLoadingCategories ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {l1Categories.map((l1) => {
                const l2Items = getL2Categories(l1.code);
                return (
                  <div key={l1.id} className="space-y-2">
                    <div
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted min-h-[44px] cursor-pointer"
                      onClick={() => toggleL1(l1.code)}
                    >
                      <Checkbox
                        checked={selectedL1.has(l1.code)}
                        onCheckedChange={() => toggleL1(l1.code)}
                      />
                      <span className="text-sm font-medium flex-1">{l1.name}</span>
                    </div>
                    {selectedL1.has(l1.code) && l2Items.length > 0 && (
                      <div className="ml-6 space-y-1">
                        {l2Items.map((l2) => (
                          <div
                            key={l2.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted min-h-[44px] cursor-pointer"
                            onClick={() => toggleL2(l2.code)}
                          >
                            <Checkbox
                              checked={selectedL2.has(l2.code)}
                              onCheckedChange={() => toggleL2(l2.code)}
                            />
                            <span className="text-sm flex-1">{l2.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Mechanic field */}
          {showMechanicFields && (
            <>
              <Separator className="my-4" />
              <div>
                <Label htmlFor="edit-mechanic-name" className="text-sm font-medium">
                  Assigned Mechanic
                </Label>
                <Input
                  id="edit-mechanic-name"
                  value={mechanicName}
                  onChange={(e) => setMechanicName(e.target.value)}
                  placeholder="Enter mechanic name"
                  className="mt-1.5"
                />
              </div>
            </>
          )}
        </div>

        <DrawerFooter className="safe-bottom">
          <Button onClick={handleSave} disabled={!hasSelection || isSaving} className="h-12">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12">
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
