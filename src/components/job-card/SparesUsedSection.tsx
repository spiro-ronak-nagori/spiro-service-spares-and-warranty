import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Camera, Plus, Pencil, Trash2, Send, RotateCcw, UserCheck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
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

const WARRANTY_STATE_LABEL: Record<WarrantyDisplayState, string> = {
  SUBMISSION_PENDING: 'Submission Pending',
  READY_TO_SUBMIT: 'Ready to Submit',
  SUBMITTED: 'Submitted',
  NEEDS_INFO: 'Needs Info',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

function isLocked(spare: JobCardSpare): boolean {
  return spare.approval_state !== 'DRAFT';
}

function getStatusText(spare: JobCardSpare, warrantyEnabled?: boolean): string {
  if (spare.claim_type === 'USER_PAID') return '';
  const displayState = getWarrantyDisplayState(spare);
  const isSubmittedState = ['SUBMITTED', 'NEEDS_INFO', 'RESUBMITTED', 'APPROVED', 'REJECTED'].includes(displayState);
  if (!warrantyEnabled && !isSubmittedState) return '';
  return WARRANTY_STATE_LABEL[displayState];
}

/* ── Decision info (who approved/rejected) ── */
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

/* ── Photo thumbnails ── */
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
          <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-md overflow-hidden border border-border bg-muted">
            <img src={photo.photo_url} alt={photo.description_prompt || label} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Single spare item ── */
function SpareItem({
  spare, canEdit, warrantyEnabled,
  onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onEditSpare, onDeleteSpare,
}: {
  spare: JobCardSpare; canEdit?: boolean; warrantyEnabled?: boolean;
  onSubmitWarranty?: (s: JobCardSpare) => void; onWithdrawSpare?: (s: JobCardSpare) => void;
  onRespondNeedsInfo?: (s: JobCardSpare) => void; onConvertToUserPaid?: (s: JobCardSpare) => void;
  onEditSpare?: (s: JobCardSpare) => void; onDeleteSpare?: (id: string) => void;
}) {
  const locked = isLocked(spare);
  const statusText = getStatusText(spare, warrantyEnabled);
  const partName = spare.spare_part?.part_name || 'Unknown Part';
  const partCode = spare.spare_part?.part_code;

  const claimColor = spare.claim_type === 'WARRANTY'
    ? 'text-blue-600'
    : spare.claim_type === 'GOODWILL'
      ? 'text-purple-600'
      : 'text-muted-foreground';

  return (
    <div className="py-3 space-y-2">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-foreground truncate">
          {partName}
          {partCode && <span className="text-muted-foreground font-normal ml-1.5">({partCode})</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Qty: {spare.qty}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className={`text-xs font-medium ${claimColor}`}>{CLAIM_LABEL[spare.claim_type]}</span>
          {statusText && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              {statusText}
            </span>
          )}
        </div>
      </div>

      {/* Details — always visible */}
      {spare.serial_number && (
        <div className="text-xs">
          <span className="text-muted-foreground">New Part Serial#:</span>{' '}
          <span className="font-medium text-foreground">{spare.serial_number}</span>
        </div>
      )}
      <SparePhotos photos={spare.photos} kind="NEW_PART_PROOF" label={PHOTO_KIND_LABEL.NEW_PART_PROOF} />

      {spare.old_part_serial_number && (
        <div className="text-xs">
          <span className="text-muted-foreground">Old Part Serial#:</span>{' '}
          <span className="font-medium text-foreground">{spare.old_part_serial_number}</span>
        </div>
      )}
      <SparePhotos photos={spare.photos} kind="OLD_PART_EVIDENCE" label={PHOTO_KIND_LABEL.OLD_PART_EVIDENCE} />
      <SparePhotos photos={spare.photos} kind="ADDITIONAL" label={PHOTO_KIND_LABEL.ADDITIONAL} />

      {spare.technician_comment && (
        <p className="text-xs text-muted-foreground italic">"{spare.technician_comment}"</p>
      )}

      <SpareDecisionInfo spare={spare} />

      {/* Actions — grouped tightly */}
      {canEdit && (
        <div className="space-y-1.5">
          {/* Primary CTAs */}
          {warrantyEnabled && onSubmitWarranty && spare.claim_type !== 'USER_PAID' && spare.approval_state === 'DRAFT' && (
            <Button variant="default" size="sm" className="h-8 text-xs w-full"
              onClick={() => onSubmitWarranty(spare)}>
              <Send className="h-3 w-3 mr-1" />
              Submit {CLAIM_LABEL[spare.claim_type]}
            </Button>
          )}

          {locked && (spare.approval_state === 'SUBMITTED' || spare.approval_state === 'RESUBMITTED') && onWithdrawSpare && (
            <Button variant="outline" size="sm" className="h-8 text-xs w-full"
              onClick={() => onWithdrawSpare(spare)}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Withdraw & Edit
            </Button>
          )}

          {spare.approval_state === 'NEEDS_INFO' && (
            <>
              <div className="bg-accent/50 border border-border rounded-md p-2 text-xs">
                <span className="font-medium text-foreground">Admin requested more info</span>
              </div>
              {onRespondNeedsInfo && (
                <Button variant="default" size="sm" className="h-8 text-xs w-full"
                  onClick={() => onRespondNeedsInfo(spare)}>
                  <Send className="h-3 w-3 mr-1" />
                  Respond
                </Button>
              )}
              {onWithdrawSpare && (
                <Button variant="outline" size="sm" className="h-8 text-xs w-full"
                  onClick={() => onWithdrawSpare(spare)}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Withdraw & Edit
                </Button>
              )}
            </>
          )}

          {spare.approval_state === 'REJECTED' && (
            <>
              {onWithdrawSpare && (
                <Button variant="default" size="sm" className="h-8 text-xs w-full"
                  onClick={() => onWithdrawSpare(spare)}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Withdraw & Edit
                </Button>
              )}
              {onConvertToUserPaid && (
                <Button variant="outline" size="sm" className="h-8 text-xs w-full"
                  onClick={() => onConvertToUserPaid(spare)}>
                  Convert to User Paid
                </Button>
              )}
            </>
          )}

          {/* Secondary actions — Edit / Delete */}
          {!locked && (onEditSpare || onDeleteSpare) && (
            <div className="flex items-center gap-4 pt-0.5">
              {onEditSpare && (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                  onClick={() => onEditSpare(spare)}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
              {onDeleteSpare && (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
                  onClick={() => onDeleteSpare(spare.id)}>
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          )}

          {locked && !['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(spare.approval_state) && (
            <p className="text-xs text-muted-foreground">
              Claim submitted. Withdraw to make changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
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
                </div>
              )}

              {locked && !['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(spare.approval_state) && (
                <p className="text-xs text-muted-foreground">
                  Claim submitted. Withdraw to make changes.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main section ── */
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

  const showSparesWarning = mandatorySparesRequired && spares.length === 0;
  const isActiveStatus = jobCardStatus === 'IN_PROGRESS' || jobCardStatus === 'REOPENED' || jobCardStatus === 'READY';
  const showWarningIndicator = showSparesWarning && isActiveStatus;

  const isWorkStatus = jobCardStatus === 'IN_PROGRESS' || jobCardStatus === 'REOPENED';
  const lockedCollapsed = spares.length === 0 && !isWorkStatus;

  return (
    <Card id="spares-used-section">
      <CardHeader className={isExpanded && !lockedCollapsed ? "pb-0" : ""}>
        <button
          type="button"
          className={`w-full flex items-center justify-between text-left ${lockedCollapsed ? 'cursor-default' : ''}`}
          onClick={lockedCollapsed ? undefined : handleToggle}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Spares Used
            </CardTitle>
            {(lockedCollapsed || !isExpanded) && (
              <p className="text-xs mt-1 ml-6">
                {showWarningIndicator ? (
                  <span className="text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Spares required for selected issues
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {spares.length} {spares.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </p>
            )}
          </div>
          {!lockedCollapsed && (
            <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          )}
        </button>
      </CardHeader>

      {!lockedCollapsed && isExpanded && (
        <CardContent className="pt-3">
          {spares.length === 0 ? (
            <div className="py-3">
              {showWarningIndicator && (
                <p className="text-xs text-amber-700 flex items-center gap-1 mb-3">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Spares required for selected issues
                </p>
              )}
              <p className="text-sm text-muted-foreground">No spares added yet</p>
              {canEdit && onAddSpares && (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                  onClick={onAddSpares}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Spare
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Clean spare list */}
              <div className="divide-y divide-border">
                {spares.map((spare) => (
                  <SpareItem
                    key={spare.id}
                    spare={spare}
                    canEdit={canEdit}
                    warrantyEnabled={warrantyEnabled}
                    onSubmitWarranty={onSubmitWarranty}
                    onWithdrawSpare={onWithdrawSpare}
                    onRespondNeedsInfo={onRespondNeedsInfo}
                    onConvertToUserPaid={onConvertToUserPaid}
                    onEditSpare={onEditSpare}
                    onDeleteSpare={onDeleteSpare}
                  />
                ))}
              </div>

              {/* Add spare at bottom */}
              {canEdit && onAddSpares && (
                <div className="pt-3 border-t border-border mt-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                    onClick={onAddSpares}
                  >
                    <Plus className="h-3 w-3" />
                    Add Spare
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
