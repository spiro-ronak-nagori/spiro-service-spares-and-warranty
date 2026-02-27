import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceCategory } from '@/types';

interface ReopenJobCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReopen: (serviceCategories: string[], issueCategories: string[], comments: string) => void;
}

const MIN_COMMENTS_LENGTH = 30;

export function ReopenJobCardDialog({
  open,
  onOpenChange,
  onReopen,
}: ReopenJobCardDialogProps) {
  const [comments, setComments] = useState('');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedL1, setSelectedL1] = useState<Set<string>>(new Set());
  const [selectedL2, setSelectedL2] = useState<Set<string>>(new Set());
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open]);

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
    const newSelected = new Set(selectedL1);
    if (newSelected.has(code)) {
      newSelected.delete(code);
      const newL2 = new Set(selectedL2);
      getL2Categories(code).forEach(c => newL2.delete(c.code));
      setSelectedL2(newL2);
    } else {
      newSelected.add(code);
    }
    setSelectedL1(newSelected);
  };

  const toggleL2 = (code: string) => {
    const newSelected = new Set(selectedL2);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedL2(newSelected);
  };

  const isCommentsValid = comments.trim().length >= MIN_COMMENTS_LENGTH;
  const hasServiceSelection = selectedL1.size > 0;
  const canSubmit = isCommentsValid && hasServiceSelection;

  const handleSubmit = () => {
    if (canSubmit) {
      onReopen(
        Array.from(selectedL1),
        Array.from(selectedL2),
        comments.trim()
      );
      resetForm();
    }
  };

  const resetForm = () => {
    setComments('');
    setSelectedL1(new Set());
    setSelectedL2(new Set());
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reopen Job Card</DialogTitle>
          <DialogDescription>
            Select the service types, issues, and provide a reason for reopening
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Service Categories */}
          <div className="space-y-3">
            <Label>
              Service Type <span className="text-destructive">*</span>
            </Label>
            {isLoadingCategories ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {l1Categories.map((l1) => {
                  const l2Items = getL2Categories(l1.code);
                  return (
                    <div key={l1.id} className="space-y-2">
                      <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                        <Checkbox
                          id={`reopen-l1-${l1.code}`}
                          checked={selectedL1.has(l1.code)}
                          onCheckedChange={() => toggleL1(l1.code)}
                        />
                        <label
                          htmlFor={`reopen-l1-${l1.code}`}
                          className="text-sm font-medium cursor-pointer flex-1"
                        >
                          {l1.name}
                        </label>
                      </div>
                      {selectedL1.has(l1.code) && l2Items.length > 0 && (
                        <div className="ml-6 space-y-1">
                          {l2Items.map((l2) => (
                            <div
                              key={l2.id}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted"
                            >
                              <Checkbox
                                id={`reopen-l2-${l2.code}`}
                                checked={selectedL2.has(l2.code)}
                                onCheckedChange={() => toggleL2(l2.code)}
                              />
                              <label
                                htmlFor={`reopen-l2-${l2.code}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {l2.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="reopen-comments">
              Reason for Reopening <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reopen-comments"
              placeholder="Describe why the job card needs to be reopened..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={comments.length < MIN_COMMENTS_LENGTH ? 'text-destructive' : 'text-muted-foreground'}>
                {comments.length}/{MIN_COMMENTS_LENGTH} minimum characters
              </span>
              {!isCommentsValid && comments.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  Too short
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
