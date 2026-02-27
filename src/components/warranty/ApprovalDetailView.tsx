import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, XCircle, MessageSquare, AlertCircle,
  Car, Gauge, Camera, Package, User, Building2, Clock, Send,
} from 'lucide-react';
import {
  ApprovalQueueItem, getTatBucket, formatTat,
  approveSpare, rejectSpare, requestMoreInfo, fetchSpareActions,
} from '@/hooks/useWarrantyApprovals';
import { SpareAction } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

const CLAIM_LABEL: Record<string, string> = { WARRANTY: 'Warranty', GOODWILL: 'Goodwill' };

const TAT_COLORS: Record<string, string> = {
  '<4h': 'bg-green-100 text-green-800',
  '4-12h': 'bg-amber-100 text-amber-800',
  '12-24h': 'bg-orange-100 text-orange-800',
  '>24h': 'bg-red-100 text-red-800',
};

interface DetailViewProps {
  item: ApprovalQueueItem;
  actorUserId: string;
  onBack: () => void;
}

export function ApprovalDetailView({ item, actorUserId, onBack }: DetailViewProps) {
  const [actions, setActions] = useState<SpareAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRequestInfo, setShowRequestInfo] = useState(false);

  useEffect(() => {
    fetchSpareActions(item.spare.id).then(a => {
      setActions(a);
      setLoadingActions(false);
    });
  }, [item.spare.id]);

  const spare = item.spare;
  const part = spare.spare_part;
  const isTerminal = ['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(spare.approval_state);

  const oldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE');
  const newPhotos = (spare.photos || []).filter(p => p.photo_kind === 'NEW_PART_PROOF');

  const handleApprove = async (reason?: string) => {
    const text = (reason || '').trim();
    if (!text) { toast.error('Comment is required'); return; }
    setProcessing(true);
    try {
      await approveSpare(spare.id, actorUserId, text);
      toast.success('Claim approved');
      setShowApprove(false);
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (reason?: string) => {
    const text = (reason || '').trim();
    if (!text) { toast.error('Comment is required'); return; }
    setProcessing(true);
    try {
      await rejectSpare(spare.id, actorUserId, text);
      toast.success('Claim rejected');
      setShowReject(false);
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestInfoSubmit = async (reason?: string) => {
    const text = (reason || '').trim();
    if (!text) { toast.error('Comment is required'); return; }
    setProcessing(true);
    try {
      await requestMoreInfo(spare.id, actorUserId, text);
      toast.success('Info requested from technician');
      setShowRequestInfo(false);
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Claim Review" subtitle={item.jc_number} showBack onBack={onBack} />
      <div className="p-4 space-y-4">
        {/* Vehicle + Odo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="h-4 w-4" /> Vehicle & Odometer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Reg No</span><p className="font-medium">{item.vehicle_reg_no}</p></div>
              <div><span className="text-muted-foreground">Model</span><p className="font-medium">{item.vehicle_model || '—'}</p></div>
              {item.vehicle_color && (
                <div><span className="text-muted-foreground">Color</span><p className="font-medium">{item.vehicle_color}</p></div>
              )}
              <div>
                <span className="text-muted-foreground">Odometer</span>
                <p className="font-medium flex items-center gap-1"><Gauge className="h-3 w-3" />{item.odometer.toLocaleString()} km</p>
              </div>
            </div>
            {item.odometer_photo_url && (
              <a href={item.odometer_photo_url} target="_blank" rel="noopener noreferrer"
                className="block w-20 h-20 rounded-md overflow-hidden border bg-muted">
                <img src={item.odometer_photo_url} alt="Odometer" className="w-full h-full object-cover" loading="lazy" />
              </a>
            )}
          </CardContent>
        </Card>

        {/* Claim Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Part</span><p className="font-medium">{part?.part_name || '—'}</p></div>
              <div><span className="text-muted-foreground">Qty</span><p className="font-medium">{spare.qty}</p></div>
              <div><span className="text-muted-foreground">Claim Type</span><p className="font-medium">{CLAIM_LABEL[spare.claim_type]}</p></div>
              <div><span className="text-muted-foreground">Workshop</span><p className="font-medium">{item.workshop_name}</p></div>
              {item.submitted_by_name && (
                <div>
                  <span className="text-muted-foreground">Submitted by</span>
                  <p className="font-medium flex items-center gap-1"><Send className="h-3 w-3" />{item.submitted_by_name}</p>
                </div>
              )}
              {spare.last_submitted_at && (
                <div>
                  <span className="text-muted-foreground">Submitted at</span>
                  <p className="font-medium text-xs">{format(new Date(spare.last_submitted_at), 'MMM d, h:mm a')}</p>
                </div>
              )}
              {item.technician_name !== '—' && (
                <div>
                  <span className="text-muted-foreground">Technician</span>
                  <p className="font-medium flex items-center gap-1"><User className="h-3 w-3" />{item.technician_name}</p>
                </div>
              )}
              <div><span className="text-muted-foreground">TAT</span>
                <Badge variant="outline" className={`text-[10px] border-0 ${TAT_COLORS[getTatBucket(item.tat_minutes)]}`}>
                  {formatTat(item.tat_minutes)}
                </Badge>
              </div>
            </div>

            {spare.old_part_serial_number && (
              <div className="text-xs">
                <span className="text-muted-foreground">Old Part Serial#:</span>
                <span className="font-medium ml-1">{spare.old_part_serial_number}</span>
              </div>
            )}

            {spare.claim_comment && (
              <div className="text-xs bg-muted/50 rounded-md p-2">
                <span className="text-muted-foreground">Claim Comment:</span>
                <p className="mt-0.5">{spare.claim_comment}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Old Part Evidence Photos */}
        {oldPhotos.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4" /> Old Part Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {oldPhotos.map(photo => (
                  <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer"
                    className="block w-20 h-20 rounded-md overflow-hidden border bg-muted">
                    <img src={photo.photo_url} alt={photo.description_prompt || 'Old part'} className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Part Proof */}
        {newPhotos.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Camera className="h-4 w-4" /> New Part Proof
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {newPhotos.map(photo => (
                  <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer"
                    className="block w-16 h-16 rounded-md overflow-hidden border bg-muted">
                    <img src={photo.photo_url} alt="New part" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> Action History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActions ? (
              <Skeleton className="h-16 w-full" />
            ) : actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No actions recorded yet.</p>
            ) : (
              <div className="relative pl-5">
                {/* Vertical timeline line */}
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
              <div className="space-y-4">
                  {[...actions].reverse().map((action, idx) => {
                    const cfg = ACTION_CONFIG[action.action_type] || { icon: AlertCircle, className: 'text-muted-foreground bg-muted', label: action.action_type };
                    const Icon = cfg.icon;
                    return (
                      <div key={action.id} className="relative">
                        {/* Timeline dot */}
                        <div className={`absolute -left-5 top-0 w-4 h-4 rounded-full flex items-center justify-center ${cfg.className}`}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>
                        <div className="text-xs">
                          <p className="font-semibold">{cfg.label}</p>
                          <p className="text-muted-foreground">
                            {action.actor?.full_name || 'Unknown'} · {format(new Date(action.created_at), 'MMM d, h:mm a')}
                          </p>
                          {action.comment && (
                            <p className="mt-1 text-muted-foreground bg-muted/50 rounded-md p-1.5 text-[11px]">
                              {action.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons — only for non-terminal states */}
        {!isTerminal && (
          <div className="space-y-2 pb-4">
            <Button className="w-full h-12" onClick={() => setShowApprove(true)} disabled={processing}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-10" onClick={() => setShowRequestInfo(true)} disabled={processing}>
                <MessageSquare className="h-4 w-4 mr-1" />
                Request Info
              </Button>
              <Button variant="destructive" className="h-10" onClick={() => setShowReject(true)} disabled={processing}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <ConfirmationDialog
        open={showApprove}
        onOpenChange={setShowApprove}
        title="Approve Claim"
        description="Add a comment for the approval."
        confirmLabel="Approve"
        requireReason
        reasonLabel="Approval Comment"
        reasonPlaceholder="Enter approval remarks (min 10 characters)..."
        onConfirm={(reason) => handleApprove(reason)}
        isLoading={processing}
      />

      {/* Request Info Dialog */}
      <ConfirmationDialog
        open={showRequestInfo}
        onOpenChange={setShowRequestInfo}
        title="Request More Information"
        description="Add a comment explaining what information is needed from the technician."
        confirmLabel="Send Request"
        requireReason
        reasonLabel="Info Request"
        reasonPlaceholder="What additional information do you need?"
        onConfirm={(reason) => handleRequestInfoSubmit(reason)}
        isLoading={processing}
      />

      {/* Reject Dialog */}
      <ConfirmationDialog
        open={showReject}
        onOpenChange={setShowReject}
        title="Reject Claim"
        description="Provide a reason for rejection."
        confirmLabel="Reject"
        variant="destructive"
        requireReason
        reasonLabel="Rejection Reason"
        reasonPlaceholder="Enter rejection reason (min 10 characters)..."
        onConfirm={(reason) => handleReject(reason)}
        isLoading={processing}
      />
    </AppLayout>
  );
}

const ACTION_CONFIG: Record<string, { icon: typeof CheckCircle2; className: string; label: string }> = {
  SUBMIT: { icon: Send, className: 'text-blue-600 bg-blue-100', label: 'Submitted' },
  APPROVE: { icon: CheckCircle2, className: 'text-white bg-green-600', label: 'Approved' },
  REJECT: { icon: XCircle, className: 'text-white bg-red-600', label: 'Rejected' },
  REQUEST_INFO: { icon: MessageSquare, className: 'text-orange-700 bg-orange-100', label: 'Info Requested' },
  TECH_RESPONSE: { icon: MessageSquare, className: 'text-blue-700 bg-blue-100', label: 'Tech Response' },
  RESUBMIT: { icon: Package, className: 'text-blue-600 bg-blue-100', label: 'Resubmitted' },
  EDIT_RESET: { icon: AlertCircle, className: 'text-amber-700 bg-amber-100', label: 'Edit Reset' },
  WITHDRAW: { icon: AlertCircle, className: 'text-amber-700 bg-amber-100', label: 'Withdrawn' },
};
