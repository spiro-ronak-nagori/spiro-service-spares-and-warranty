import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Package, Camera, Plus, Pencil, Trash2, Check, X, Send, RotateCcw, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { JobCardSpare, SparePhotoKind, getWarrantyDisplayState, WarrantyDisplayState } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface SparesUsedSectionProps {
  spares: JobCardSpare[];
  isLoading: boolean;
  onAddSpares?: () => void;
  onEditSpare?: (spare: JobCardSpare) => void;
  onDeleteSpare?: (spareId: string) => void;
  onSubmitWarranty?: (spare: JobCardSpare) => void;
  onWithdrawSpare?: (spare: JobCardSpare) => void;
  onRespondNeedsInfo?: (spare: JobCardSpare) => void;
  onConvertToUserPaid?: (spare: JobCardSpare) => void;
  onSubmitAll?: () => void;
  canEdit?: boolean;
  warrantyEnabled?: boolean;
  mandatorySparesRequired?: boolean;
  jobCardStatus?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const CLAIM_LABEL: Record<string, string> = {
  USER_PAID: 'User Paid',
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
};

const PHOTO_KIND_LABEL: Record<SparePhotoKind, string> = {
  NEW_PART_PROOF: 'New Part Proof',
  OLD_PART_EVIDENCE: 'Old Part Evidence',
  ADDITIONAL: 'Additional',
};

const WARRANTY_STATE_CONFIG: Record<WarrantyDisplayState, { label: string; className: string }> = {
  SUBMISSION_PENDING: { label: 'Submission Pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  READY_TO_SUBMIT: { label: 'Ready to Submit', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  SUBMITTED: { label: 'Submitted', className: 'bg-green-100 text-green-800 border-green-200' },
  NEEDS_INFO: { label: 'Needs Info', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  RESUBMITTED: { label: 'Resubmitted', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  APPROVED: { label: 'Approved', className: 'bg-green-600 text-white border-green-600' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
};

const CLAIM_TYPE_CLASS: Record<string, string> = {
  WARRANTY: 'bg-blue-600 text-white hover:bg-blue-600',
  GOODWILL: 'bg-pink-600 text-white hover:bg-pink-600',
  USER_PAID: 'bg-muted text-muted-foreground hover:bg-muted',
};

function isLocked(spare: JobCardSpare): boolean {
  return spare.approval_state !== 'DRAFT';
}

function WarrantyBadge({ spare, warrantyEnabled }: { spare: JobCardSpare; warrantyEnabled?: boolean }) {
  if (spare.claim_type === 'USER_PAID') return null;
  const displayState = getWarrantyDisplayState(spare);
  const isSubmittedState = ['SUBMITTED', 'NEEDS_INFO', 'RESUBMITTED', 'APPROVED', 'REJECTED'].includes(displayState);
  if (!warrantyEnabled && !isSubmittedState) return null;
  const config = WARRANTY_STATE_CONFIG[displayState];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function SpareDecisionInfo({ spare }: { spare: JobCardSpare }) {
  const [actorName, setActorName] = useState<string | null>(null);
  const relevantStates = ['APPROVED', 'REJECTED', 'NEEDS_INFO'];
  const showDecision = relevantStates.includes(spare.approval_state);

  useEffect(() => {
    if (!showDecision) return;
    (async () => {
      const actionMap: Record<string, string> = { APPROVED: 'APPROVE', REJECTED: 'REJECT', NEEDS_INFO: 'REQUEST_INFO' };
      const actionType = actionMap[spare.approval_state];
      const { data } = await supabase
        .from('job_card_spare_actions' as any)
        .select('actor_user_id, comment, created_at')
        .eq('job_card_spare_id', spare.id)
        .eq('action_type', actionType)
        .order('created_at', { ascending: false })
        .limit(1);

      const action = (data || [])[0] as any;
      if (action?.comment === 'Auto-approved (no approval required)') {
        setActorName('System');
      } else if (action?.actor_user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', action.actor_user_id)
          .maybeSingle();
        if (profile) setActorName(profile.full_name);
      }
    })();
  }, [spare.id, spare.approval_state, showDecision]);

  if (!showDecision || !actorName) return null;
  const labelMap: Record<string, string> = { APPROVED: 'Approved by', REJECTED: 'Rejected by', NEEDS_INFO: 'Info requested by' };

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <UserCheck className="h-3 w-3" />
      <span>{labelMap[spare.approval_state]} <span className="font-medium">{actorName}</span></span>
    </div>
  );
}

function SparePhotos({ photos, kind, label }: { photos: JobCardSpare['photos']; kind: SparePhotoKind; label: string }) {
  const filtered = (photos || []).filter(p => p.photo_kind === kind);
  if (filtered.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Camera className="h-3 w-3" />
        {label}
      </p>
      <div className="flex gap-2 flex-wrap">
        {filtered.map(photo => (
          <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-md overflow-hidden border bg-muted">
            <img src={photo.photo_url} alt={photo.description_prompt || label} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

function SpareActions({
  spare, canEdit, warrantyEnabled, onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onEditSpare, onDeleteSpare,
}: {
  spare: JobCardSpare; canEdit?: boolean; warrantyEnabled?: boolean;
  onSubmitWarranty?: (s: JobCardSpare) => void; onWithdrawSpare?: (s: JobCardSpare) => void;
  onRespondNeedsInfo?: (s: JobCardSpare) => void; onConvertToUserPaid?: (s: JobCardSpare) => void;
  onEditSpare?: (s: JobCardSpare) => void; onDeleteSpare?: (id: string) => void;
}) {
  if (!canEdit) return null;
  const locked = isLocked(spare);

  return (
    <div className="space-y-2">
      {/* Submit Warranty CTA — only for DRAFT warranty/goodwill */}
      {warrantyEnabled && onSubmitWarranty && spare.claim_type !== 'USER_PAID' && spare.approval_state === 'DRAFT' && (
        <Button variant="default" size="sm" className="h-8 text-xs w-full"
          onClick={(e) => { e.stopPropagation(); onSubmitWarranty(spare); }}>
          <Send className="h-3 w-3 mr-1" />
          Submit {CLAIM_LABEL[spare.claim_type]}
        </Button>
      )}

      {/* Withdraw — for SUBMITTED/RESUBMITTED */}
      {locked && (spare.approval_state === 'SUBMITTED' || spare.approval_state === 'RESUBMITTED') && onWithdrawSpare && (
        <Button variant="outline" size="sm" className="h-8 text-xs w-full"
          onClick={(e) => { e.stopPropagation(); onWithdrawSpare(spare); }}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Withdraw & Edit
        </Button>
      )}

      {/* NEEDS_INFO */}
      {spare.approval_state === 'NEEDS_INFO' && (
        <div className="space-y-2">
          <div className="bg-orange-50 border border-orange-200 rounded-md p-2 text-xs">
            <span className="font-medium text-orange-800">Admin requested more info</span>
          </div>
          {onRespondNeedsInfo && (
            <Button variant="default" size="sm" className="h-8 text-xs w-full"
              onClick={(e) => { e.stopPropagation(); onRespondNeedsInfo(spare); }}>
              <Send className="h-3 w-3 mr-1" />
              Respond
            </Button>
          )}
          {onWithdrawSpare && (
            <Button variant="outline" size="sm" className="h-8 text-xs w-full"
              onClick={(e) => { e.stopPropagation(); onWithdrawSpare(spare); }}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Withdraw & Edit
            </Button>
          )}
        </div>
      )}

      {/* REJECTED */}
      {spare.approval_state === 'REJECTED' && (
        <div className="space-y-2">
          {onWithdrawSpare && (
            <Button variant="default" size="sm" className="h-8 text-xs w-full"
              onClick={(e) => { e.stopPropagation(); onWithdrawSpare(spare); }}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Withdraw & Edit
            </Button>
          )}
          {onConvertToUserPaid && (
            <Button variant="outline" size="sm" className="h-8 text-xs w-full"
              onClick={(e) => { e.stopPropagation(); onConvertToUserPaid(spare); }}>
              Convert to User Paid
            </Button>
          )}
        </div>
      )}

      {/* Edit / Delete — DRAFT only */}
      <div className="flex items-center gap-2 pt-2 border-t">
        {locked && !['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(spare.approval_state) ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground">
                  Claim submitted. Withdraw to make changes.
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>This spare line is locked because the claim has been submitted. Use "Withdraw & Edit" to reset and make changes.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : locked ? null : (
          <>
            {onEditSpare && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                onClick={(e) => { e.stopPropagation(); onEditSpare(spare); }}>
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            {onDeleteSpare && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
                onClick={(e) => { e.stopPropagation(); onDeleteSpare(spare.id); }}>
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SparesUsedSection({ spares, isLoading, onAddSpares, onEditSpare, onDeleteSpare, onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onSubmitAll, canEdit, warrantyEnabled, mandatorySparesRequired, jobCardStatus, isExpanded: controlledExpanded, onToggle }: SparesUsedSectionProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : localExpanded;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalExpanded(!localExpanded);
  };

  const showSubmitAll = useMemo(() => {
    if (!warrantyEnabled || !canEdit || !onSubmitAll) return false;
    const warrantyDraftLines = spares.filter(
      s => s.claim_type !== 'USER_PAID' && s.approval_state === 'DRAFT'
    );
    if (warrantyDraftLines.length === 0) return false;
    return warrantyDraftLines.every(s => getWarrantyDisplayState(s) === 'READY_TO_SUBMIT');
  }, [spares, warrantyEnabled, canEdit, onSubmitAll]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Spares Used
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const showSparesWarning = mandatorySparesRequired && spares.length === 0 && jobCardStatus === 'READY';

  return (
    <Card id="spares-used-section">
      <CardHeader className={isExpanded ? "pb-0" : ""}>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={handleToggle}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Spares Used
            </CardTitle>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                {spares.length} {spares.length === 1 ? 'item' : 'items'}
                {showSparesWarning && <span className="ml-2">· ⚠ Spares required before delivery</span>}
              </p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3">
          {spares.length === 0 ? (
            <div className="text-center py-4">
              <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No spares added yet</p>
              {canEdit && onAddSpares && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                  onClick={onAddSpares}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Spares
                </button>
              )}
            </div>
          ) : (
            <>
              <Accordion type="multiple" className="w-full">
                {spares.map((spare) => (
                  <AccordionItem key={spare.id} value={spare.id}>
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {spare.spare_part?.part_name || 'Unknown Part'}
                            {spare.spare_part?.part_code && (
                              <span className="text-muted-foreground font-normal"> ({spare.spare_part.part_code})</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">Qty: {spare.qty}</Badge>
                            <Badge variant="secondary" className={`text-[10px] h-5 px-1.5 ${CLAIM_TYPE_CLASS[spare.claim_type] || ''}`}>
                              {CLAIM_LABEL[spare.claim_type]}
                            </Badge>
                            <WarrantyBadge spare={spare} warrantyEnabled={warrantyEnabled} />
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-1">
                        {spare.serial_number && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">New Part Serial#:</span>{' '}
                            <span className="font-medium">{spare.serial_number}</span>
                          </div>
                        )}
                        <SparePhotos photos={spare.photos} kind="NEW_PART_PROOF" label={PHOTO_KIND_LABEL.NEW_PART_PROOF} />
                        {spare.old_part_serial_number && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Old Part Serial#:</span>{' '}
                            <span className="font-medium">{spare.old_part_serial_number}</span>
                          </div>
                        )}
                        <SparePhotos photos={spare.photos} kind="OLD_PART_EVIDENCE" label={PHOTO_KIND_LABEL.OLD_PART_EVIDENCE} />
                        <SparePhotos photos={spare.photos} kind="ADDITIONAL" label={PHOTO_KIND_LABEL.ADDITIONAL} />
                        {spare.technician_comment && (
                          <p className="text-xs text-muted-foreground italic">"{spare.technician_comment}"</p>
                        )}
                        <SpareDecisionInfo spare={spare} />
                        <SpareActions
                          spare={spare} canEdit={canEdit} warrantyEnabled={warrantyEnabled}
                          onSubmitWarranty={onSubmitWarranty} onWithdrawSpare={onWithdrawSpare}
                          onRespondNeedsInfo={onRespondNeedsInfo} onConvertToUserPaid={onConvertToUserPaid}
                          onEditSpare={onEditSpare} onDeleteSpare={onDeleteSpare}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {/* Single secondary CTA for adding more */}
              {canEdit && onAddSpares && (
                <div className="pt-3 border-t border-border mt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                    onClick={onAddSpares}
                  >
                    <Plus className="h-3 w-3" />
                    Add Spares
                  </button>
                </div>
              )}

              {showSubmitAll && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground text-center">Review all parts above before submitting.</p>
                  <Button variant="default" className="w-full" onClick={onSubmitAll}>
                    <Send className="h-4 w-4 mr-2" />
                    Submit All Claims
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
