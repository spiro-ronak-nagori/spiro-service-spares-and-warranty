import { useState } from 'react';
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
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { JobCard } from '@/types';
import { useServiceCategoryNames } from '@/hooks/useServiceCategoryNames';

interface CompleteWorkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCard: JobCard;
  onComplete: (remarks: string) => void;
}

const MIN_REMARKS_LENGTH = 30;

export function CompleteWorkDialog({
  open,
  onOpenChange,
  jobCard,
  onComplete,
}: CompleteWorkDialogProps) {
  const [remarks, setRemarks] = useState('');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const { resolve: resolveCategoryName } = useServiceCategoryNames();

  const allIssues = jobCard.issue_categories;
  const isRemarksValid = remarks.trim().length >= MIN_REMARKS_LENGTH;
  const allChecked = allIssues.length === 0 || allIssues.every(item => checkedItems.has(item));
  const canSubmit = isRemarksValid && allChecked;

  const handleToggle = (item: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(item)) {
      newChecked.delete(item);
    } else {
      newChecked.add(item);
    }
    setCheckedItems(newChecked);
  };

  const handleSubmit = () => {
    if (canSubmit) {
      onComplete(remarks.trim());
      setRemarks('');
      setCheckedItems(new Set());
    }
  };

  const handleClose = () => {
    setRemarks('');
    setCheckedItems(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Work</DialogTitle>
          <DialogDescription>
            Confirm all issues are resolved and add completion remarks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Issues Checklist */}
          {allIssues.length > 0 && (
            <div className="space-y-3">
              <Label>Confirm completed work</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {allIssues.map((item, i) => (
                  <div 
                    key={i}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted"
                  >
                    <Checkbox
                      id={`item-${i}`}
                      checked={checkedItems.has(item)}
                      onCheckedChange={() => handleToggle(item)}
                    />
                    <label 
                      htmlFor={`item-${i}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {resolveCategoryName(item)}
                    </label>
                    {checkedItems.has(item) && (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remarks */}
          <div className="space-y-2">
            <Label htmlFor="remarks">
              Completion Remarks <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="remarks"
              placeholder="Describe the work completed, parts replaced, observations..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={remarks.length < MIN_REMARKS_LENGTH ? 'text-destructive' : 'text-muted-foreground'}>
                {remarks.length}/{MIN_REMARKS_LENGTH} minimum characters
              </span>
              {!isRemarksValid && remarks.length > 0 && (
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
            Complete Work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
