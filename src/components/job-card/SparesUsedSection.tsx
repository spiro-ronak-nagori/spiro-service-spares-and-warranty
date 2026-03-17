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
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
  USER_PAID: 'User Paid',
};

const CLAIM_ORDER: string[] = ['WARRANTY', 'GOODWILL', 'USER_PAID'];

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

/* ── Decision info ── */
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
    <div>
      <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1 mb-1">
        <Camera className="h-2.5 w-2.5" />
        {label}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {filtered.map(photo => (
          <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded overflow-hidden border border-border bg-muted">
            <img src={photo.photo_url} alt={photo.description_prompt || label} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Check if spare needs action ── */
function needsAction(spare: JobCardSpare): boolean {
  const state = getWarrantyDisplayState(spare);
  return ['SUBMISSION_PENDING', 'READY_TO_SUBMIT', 'NEEDS_INFO'].includes(state) && spare.approval_state === 'DRAFT'
    || spare.approval_state === 'NEEDS_INFO'
    || spare.approval_state === 'REJECTED';
}

/* ── Single spare item (collapsed/expanded) ── */
function SpareItem({
  spare, canEdit, warrantyEnabled, expanded, onToggleExpand,
  onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onEditSpare, onDeleteSpare,
}: {
  spare: JobCardSpare; canEdit?: boolean; warrantyEnabled?: boolean;
  expanded: boolean; onToggleExpand: () => void;
  onSubmitWarranty?: (s: JobCardSpare) => void; onWithdrawSpare?: (s: JobCardSpare) => void;
  onRespondNeedsInfo?: (s: JobCardSpare) => void; onConvertToUserPaid?: (s: JobCardSpare) => void;
  onEditSpare?: (s: JobCardSpare) => void; onDeleteSpare?: (id: string) => void;
}) {
  const locked = isLocked(spare);
  const statusText = getStatusText(spare, warrantyEnabled);
  const partName = spare.spare_part?.part_name || 'Unknown Part';
  const partCode = spare.spare_part?.part_code;

  return (
    <div className="py-2">
      {/* Collapsed summary — always visible */}
      <button
        type="button"
        className="w-full flex items-start justify-between text-left gap-2 active:bg-muted/30 rounded-md -mx-1 px-1 py-0.5 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {partName}
            {partCode && <span className="text-muted-foreground font-normal ml-1.5">({partCode})</span>}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Qty: {spare.qty}</span>
            {statusText && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  {statusText}
                </span>
              </>
            )}
          </div>
        </div>
        {expanded && (
          <div className="shrink-0 text-muted-foreground/50 mt-1">
            <ChevronUp className="h-3 w-3" />
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-1.5 space-y-1.5 pl-0">
          {spare.serial_number && (
            <div className="text-xs">
              <span className="text-muted-foreground/70">Serial#:</span>{' '}
              <span className="font-medium text-foreground">{spare.serial_number}</span>
            </div>
          )}
          {spare.old_part_serial_number && (
            <div className="text-xs">
              <span className="text-muted-foreground/70">Old Part#:</span>{' '}
              <span className="font-medium text-foreground">{spare.old_part_serial_number}</span>
            </div>
          )}

          <SparePhotos photos={spare.photos} kind="NEW_PART_PROOF" label={PHOTO_KIND_LABEL.NEW_PART_PROOF} />
          <SparePhotos photos={spare.photos} kind="OLD_PART_EVIDENCE" label={PHOTO_KIND_LABEL.OLD_PART_EVIDENCE} />
          <SparePhotos photos={spare.photos} kind="ADDITIONAL" label={PHOTO_KIND_LABEL.ADDITIONAL} />

          {spare.technician_comment && (
            <p className="text-[11px] text-muted-foreground italic">"{spare.technician_comment}"</p>
          )}

          <SpareDecisionInfo spare={spare} />

          {/* Actions */}
          {canEdit && (
            <div className="space-y-1.5 pt-1">
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
                  <div className="bg-accent/50 border border-border rounded p-1.5 text-xs">
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

              {!locked && (onEditSpare || onDeleteSpare) && (
                <div className="flex items-center gap-4">
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
                <p className="text-[11px] text-muted-foreground">
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

/* ── Claim type group ── */
function SpareGroup({
  claimType, spares, expandedId, onToggleExpand, canEdit, warrantyEnabled,
  onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onEditSpare, onDeleteSpare,
}: {
  claimType: string; spares: JobCardSpare[];
  expandedId: string | null; onToggleExpand: (id: string) => void;
  canEdit?: boolean; warrantyEnabled?: boolean;
  onSubmitWarranty?: (s: JobCardSpare) => void; onWithdrawSpare?: (s: JobCardSpare) => void;
  onRespondNeedsInfo?: (s: JobCardSpare) => void; onConvertToUserPaid?: (s: JobCardSpare) => void;
  onEditSpare?: (s: JobCardSpare) => void; onDeleteSpare?: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {CLAIM_LABEL[claimType]}
        </span>
        <span className="text-[10px] text-muted-foreground/60">({spares.length})</span>
      </div>
      <div className="space-y-0.5">
        {spares.map((spare) => (
          <SpareItem
            key={spare.id}
            spare={spare}
            expanded={expandedId === spare.id}
            onToggleExpand={() => onToggleExpand(spare.id)}
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
    </div>
  );
}

/* ── Main section ── */
export function SparesUsedSection({ spares, isLoading, onAddSpares, onEditSpare, onDeleteSpare, onSubmitWarranty, onWithdrawSpare, onRespondNeedsInfo, onConvertToUserPaid, onSubmitAll, canEdit, warrantyEnabled, mandatorySparesRequired, jobCardStatus, isExpanded: controlledExpanded, onToggle }: SparesUsedSectionProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  // Auto-expand first actionable spare
  const defaultExpandId = useMemo(() => {
    const actionable = spares.find(s => needsAction(s));
    return actionable?.id ?? null;
  }, [spares]);
  const [expandedSpareId, setExpandedSpareId] = useState<string | null>(defaultExpandId);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : localExpanded;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalExpanded(!localExpanded);
  };

  const handleToggleSpare = (id: string) => {
    setExpandedSpareId(prev => prev === id ? null : id);
  };

  // Group spares by claim type in defined order
  const groups = useMemo(() => {
    const map = new Map<string, JobCardSpare[]>();
    for (const type of CLAIM_ORDER) {
      const items = spares.filter(s => s.claim_type === type);
      if (items.length > 0) map.set(type, items);
    }
    return map;
  }, [spares]);

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
              {/* Grouped spare list */}
              <div className="space-y-4">
                {Array.from(groups.entries()).map(([claimType, groupSpares]) => (
                  <SpareGroup
                    key={claimType}
                    claimType={claimType}
                    spares={groupSpares}
                    expandedId={expandedSpareId}
                    onToggleExpand={handleToggleSpare}
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
                <div className="pt-3 border-t border-border mt-3">
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
