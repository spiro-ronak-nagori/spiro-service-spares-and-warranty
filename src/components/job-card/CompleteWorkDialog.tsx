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
import { AlertCircle, CheckCircle2, Package } from 'lucide-react';
import { JobCard, JobCardSpare } from '@/types';
import { useServiceCategoryNames } from '@/hooks/useServiceCategoryNames';
import { supabase } from '@/integrations/supabase/client';

interface CompleteWorkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCard: JobCard;
  onComplete: (remarks: string) => void;
  sparesEnabled?: boolean;
  spares?: JobCardSpare[];
  warrantyEnabled?: boolean;
  onOpenSparesModal?: () => void;
}

interface SparesBlocker {
  missingSpares: boolean;
  issuesRequiringSpares: string[];
  lineBlockers: string[];
}

const MIN_REMARKS_LENGTH = 30;

export function CompleteWorkDialog({
  open,
  onOpenChange,
  jobCard,
  onComplete,
  sparesEnabled,
  spares = [],
  warrantyEnabled,
  onOpenSparesModal,
}: CompleteWorkDialogProps) {
  const [remarks, setRemarks] = useState('');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const { resolve: resolveCategoryName } = useServiceCategoryNames();
  const [sparesBlocker, setSparesBlocker] = useState<SparesBlocker | null>(null);
  const [checkingSpares, setCheckingSpares] = useState(false);

  const allIssues = jobCard.issue_categories;
  const isRemarksValid = remarks.trim().length >= MIN_REMARKS_LENGTH;
  const allChecked = allIssues.length === 0 || allIssues.every(item => checkedItems.has(item));
  const hasSparesBlocker = sparesBlocker && (sparesBlocker.missingSpares || sparesBlocker.lineBlockers.length > 0);
  const canSubmit = isRemarksValid && allChecked && !hasSparesBlocker;

  // Check spares blockers when dialog opens
  useEffect(() => {
    if (open && sparesEnabled) {
      checkSparesBlockers();
    } else {
      setSparesBlocker(null);
    }
  }, [open, sparesEnabled, spares]);

  const checkSparesBlockers = async () => {
    setCheckingSpares(true);
    const blocker: SparesBlocker = { missingSpares: false, issuesRequiringSpares: [], lineBlockers: [] };

    try {
      // Check if any selected issue requires spares
      if (spares.length === 0 && jobCard.issue_categories.length > 0) {
        const { data: issueRows } = await supabase
          .from('service_categories')
          .select('name, code, requires_spares')
          .in('code', jobCard.issue_categories)
          .eq('requires_spares', true);

        if (issueRows && issueRows.length > 0) {
          blocker.missingSpares = true;
          blocker.issuesRequiringSpares = issueRows.map(r => r.name);
        }
      }

      // Check each spare line for missing required fields/photos
      for (const spare of spares) {
        const part = spare.spare_part;
        if (!part) continue;
        if (part.serial_required && !spare.serial_number) {
          blocker.lineBlockers.push(`${part.part_name}: Part serial number is required`);
        }
        const proofPhotos = (spare.photos || []).filter(p => p.photo_kind === 'NEW_PART_PROOF');
        if (part.usage_proof_photos_required_count > 0 && proofPhotos.length < part.usage_proof_photos_required_count) {
          blocker.lineBlockers.push(`${part.part_name}: ${part.usage_proof_photos_required_count} proof photo(s) required, ${proofPhotos.length} uploaded`);
        }
        if (warrantyEnabled && spare.claim_type !== 'USER_PAID') {
          const oldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE');
          const reqCount = spare.claim_type === 'WARRANTY'
            ? part.warranty_old_part_photos_required_count
            : part.goodwill_old_part_photos_required_count;
          if (reqCount > 0 && oldPhotos.length < reqCount) {
            blocker.lineBlockers.push(`${part.part_name}: ${reqCount} old-part evidence photo(s) required for ${spare.claim_type}, ${oldPhotos.length} uploaded`);
          }

          // Phase 2: Check approval-required lines for blocking states
          const isWarranty = spare.claim_type === 'WARRANTY';
          const approvalNeeded = isWarranty ? part.warranty_approval_needed : part.goodwill_approval_needed;
          if (approvalNeeded) {
            if (spare.approval_state === 'SUBMITTED' || spare.approval_state === 'RESUBMITTED') {
              blocker.lineBlockers.push(`${part.part_name}: ${spare.claim_type} claim pending admin approval`);
            } else if (spare.approval_state === 'NEEDS_INFO') {
              blocker.lineBlockers.push(`${part.part_name}: Admin requested more info — respond before completing`);
            } else if (spare.approval_state === 'REJECTED') {
              blocker.lineBlockers.push(`${part.part_name}: ${spare.claim_type} claim rejected — withdraw & edit, change to User Paid, or remove`);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to check spares blockers:', err);
    } finally {
      setSparesBlocker(blocker);
      setCheckingSpares(false);
    }
  };

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

  const handleAddSparesNow = () => {
    handleClose();
    onOpenSparesModal?.();
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
          {/* Spares Blocker Warning */}
          {hasSparesBlocker && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-destructive">
                    {sparesBlocker!.missingSpares
                      ? 'Spares are required for one or more selected issues. Please add spares before completing work.'
                      : 'Some spare parts have incomplete documentation.'}
                  </p>

                  {sparesBlocker!.issuesRequiringSpares.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-destructive mb-1">Issues requiring spares:</p>
                      <ul className="space-y-1">
                        {sparesBlocker!.issuesRequiringSpares.map((name, i) => (
                          <li key={i} className="text-xs text-destructive/80 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sparesBlocker!.lineBlockers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-destructive mb-1">Missing documentation:</p>
                      <ul className="space-y-1">
                        {sparesBlocker!.lineBlockers.map((msg, i) => (
                          <li key={i} className="text-xs text-destructive/80 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                            {msg}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {onOpenSparesModal && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleAddSparesNow}
                      className="mt-2"
                    >
                      <Package className="h-3.5 w-3.5 mr-1.5" />
                      Add Spares Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

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
