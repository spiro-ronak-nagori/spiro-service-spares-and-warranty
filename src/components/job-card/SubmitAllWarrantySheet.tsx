import { useState, useMemo } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Send, Check, Camera } from 'lucide-react';
import { JobCardSpare, getWarrantyDisplayState } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

interface SubmitAllWarrantySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spares: JobCardSpare[];
  jobCardId: string;
  profileId: string;
  onSubmitted: () => void;
}

const CLAIM_LABEL: Record<string, string> = {
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
};

export function SubmitAllWarrantySheet({
  open, onOpenChange, spares, jobCardId, profileId, onSubmitted,
}: SubmitAllWarrantySheetProps) {
  // Only eligible lines: WARRANTY/GOODWILL + DRAFT + READY_TO_SUBMIT
  const eligibleSpares = useMemo(() =>
    spares.filter(s =>
      s.claim_type !== 'USER_PAID' &&
      s.approval_state === 'DRAFT' &&
      getWarrantyDisplayState(s) === 'READY_TO_SUBMIT'
    ), [spares]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(eligibleSpares.map(s => s.id))
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset selection when sheet opens with new spares
  const eligibleIdKey = eligibleSpares.map(s => s.id).join(',');
  const [prevKey, setPrevKey] = useState(eligibleIdKey);
  if (eligibleIdKey !== prevKey) {
    setPrevKey(eligibleIdKey);
    setSelectedIds(new Set(eligibleSpares.map(s => s.id)));
    setComment('');
  }

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = eligibleSpares.length > 0 && selectedIds.size === eligibleSpares.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleSpares.map(s => s.id)));
    }
  };

  const selectedCount = selectedIds.size;

  const handleSubmitClick = () => {
    if (selectedCount === 0) return;
    setShowConfirm(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Look up workshop_id
      const { data: jcRow } = await supabase
        .from('job_cards')
        .select('workshop_id')
        .eq('id', jobCardId)
        .maybeSingle();
      const workshopId = jcRow?.workshop_id || null;

      const now = new Date().toISOString();
      const trimmedComment = comment.trim() || null;

      let successCount = 0;

      for (const spare of eligibleSpares) {
        if (!selectedIds.has(spare.id)) continue;

        const part = spare.spare_part;
        const needsApproval = spare.claim_type === 'WARRANTY'
          ? part?.warranty_approval_needed ?? true
          : part?.goodwill_approval_needed ?? true;

        // Check for prior admin actions to determine resubmission
        const { data: adminActions } = await supabase
          .from('job_card_spare_actions' as any)
          .select('id')
          .eq('job_card_spare_id', spare.id)
          .in('action_type', ['REQUEST_INFO', 'REJECT', 'APPROVE'])
          .limit(1);

        const hasAdminActed = (adminActions && adminActions.length > 0);
        let isResubmission = false;

        if (hasAdminActed) {
          const lastPartId = (spare as any).last_submitted_spare_part_id;
          const lastQty = (spare as any).last_submitted_qty;
          const lastClaimType = (spare as any).last_submitted_claim_type;
          isResubmission =
            lastPartId === spare.spare_part_id &&
            lastQty === spare.qty &&
            lastClaimType === spare.claim_type;
        }

        const submissionState = needsApproval
          ? (isResubmission ? 'RESUBMITTED' : 'SUBMITTED')
          : 'APPROVED';

        // Only fill comment if spare doesn't already have one
        const claimComment = spare.claim_comment ? spare.claim_comment : trimmedComment;

        const updatePayload: any = {
          approval_state: submissionState,
          submitted_at: spare.submitted_at || now,
          last_submitted_at: now,
          claim_comment: claimComment,
          submitted_by: userId,
          last_submitted_spare_part_id: spare.spare_part_id,
          last_submitted_qty: spare.qty,
          last_submitted_claim_type: spare.claim_type,
        };
        if (!needsApproval) {
          updatePayload.decided_at = now;
        }

        const { error } = await supabase
          .from('job_card_spares' as any)
          .update(updatePayload)
          .eq('id', spare.id);

        if (error) {
          console.error(`Failed to submit spare ${spare.id}:`, error);
          continue;
        }

        // Log action
        const actionType = isResubmission ? 'RESUBMIT' : 'SUBMIT';
        await supabase.from('job_card_spare_actions' as any).insert({
          job_card_spare_id: spare.id,
          job_card_id: jobCardId,
          workshop_id: workshopId,
          action_type: actionType,
          comment: trimmedComment,
          actor_user_id: userId,
        } as any);

        // Auto-approve log
        if (!needsApproval) {
          await supabase.from('job_card_spare_actions' as any).insert({
            job_card_spare_id: spare.id,
            job_card_id: jobCardId,
            workshop_id: workshopId,
            action_type: 'APPROVE',
            comment: 'Auto-approved (no approval required)',
            actor_user_id: userId,
          } as any);
        }

        successCount++;
      }

      if (successCount > 0) {
        toast.success(`${successCount} claim${successCount > 1 ? 's' : ''} submitted`);
      }
      setComment('');
      onSubmitted();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Submit all error:', err);
      toast.error(err.message || 'Failed to submit claims');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Submit Warranty Claims
            </DrawerTitle>
            <DrawerDescription>
              Review and submit {eligibleSpares.length} eligible claim{eligibleSpares.length !== 1 ? 's' : ''}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-4 space-y-4 overflow-y-auto">
            {/* Select all toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedCount} of {eligibleSpares.length} selected
              </span>
            </div>

            {/* Claim lines */}
            <div className="space-y-2">
              {eligibleSpares.map(spare => {
                const part = spare.spare_part;
                const checked = selectedIds.has(spare.id);
                const oldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE').length;

                return (
                  <label
                    key={spare.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      checked ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleItem(spare.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {part?.part_name || 'Unknown Part'}
                        {part?.part_code && (
                          <span className="text-muted-foreground font-normal"> ({part.part_code})</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          Qty: {spare.qty}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] h-5 px-1.5 ${
                            spare.claim_type === 'WARRANTY'
                              ? 'bg-blue-600 text-white hover:bg-blue-600'
                              : 'bg-pink-600 text-white hover:bg-pink-600'
                          }`}
                        >
                          {CLAIM_LABEL[spare.claim_type]}
                        </Badge>
                        {spare.serial_number && (
                          <span className="text-[10px] text-muted-foreground">
                            S/N: {spare.serial_number}
                          </span>
                        )}
                      </div>
                      {/* Doc summary */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {oldPhotos > 0 && (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <Camera className="h-2.5 w-2.5" />
                            {oldPhotos} old-part photo{oldPhotos > 1 ? 's' : ''}
                          </span>
                        )}
                        {spare.old_part_serial_number && (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <Check className="h-2.5 w-2.5" />
                            Old S/N
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Common comment */}
            <div className="space-y-1.5">
              <Label htmlFor="bulk-comment">Comment (applies to selected)</Label>
              <Textarea
                id="bulk-comment"
                placeholder="Optional comment for all selected claims..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <DrawerFooter>
            <Button
              onClick={handleSubmitClick}
              disabled={selectedCount === 0 || submitting}
            >
              {submitting ? 'Submitting...' : `Submit ${selectedCount} Claim${selectedCount !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <ConfirmationDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Confirm submission"
        description={`Are you sure you want to submit ${selectedCount} claim${selectedCount !== 1 ? 's' : ''}?`}
        confirmLabel="Yes, Submit"
        cancelLabel="Cancel"
        isLoading={submitting}
        onConfirm={handleConfirmedSubmit}
      />
    </>
  );
}
