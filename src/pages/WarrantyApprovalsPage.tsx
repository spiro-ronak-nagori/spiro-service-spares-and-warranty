import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Search, Clock, CheckCircle2, XCircle, MessageSquare, AlertCircle, ChevronRight,
  Car, Gauge, Camera, Package, User, Building2
} from 'lucide-react';
import {
  useWarrantyApprovalQueue, ApprovalQueueItem, getTatBucket, formatTat,
  approveSpare, rejectSpare, requestMoreInfo, fetchSpareActions,
} from '@/hooks/useWarrantyApprovals';
import { SpareAction } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useCountries } from '@/hooks/useCountries';

const CLAIM_LABEL: Record<string, string> = { WARRANTY: 'Warranty', GOODWILL: 'Goodwill' };

const TAT_COLORS: Record<string, string> = {
  '<4h': 'bg-green-100 text-green-800',
  '4-12h': 'bg-amber-100 text-amber-800',
  '12-24h': 'bg-orange-100 text-orange-800',
  '>24h': 'bg-red-100 text-red-800',
};

export default function WarrantyApprovalsPage() {
  const { profile, user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<ApprovalQueueItem | null>(null);

  const { items, isLoading, refetch } = useWarrantyApprovalQueue({
    status: statusFilter,
    search: search.trim() || undefined,
  });

  // TAT bucket counts
  const buckets = items.reduce((acc, item) => {
    const bucket = getTatBucket(item.tat_minutes);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (selectedItem) {
    return (
      <ApprovalDetailView
        item={selectedItem}
        actorUserId={user?.id || ''}
        onBack={() => { setSelectedItem(null); refetch(); }}
      />
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Warranty Approvals" />
      <div className="p-4 space-y-4">
        {/* TAT Buckets */}
        <div className="flex gap-2 flex-wrap">
          {(['<4h', '4-12h', '12-24h', '>24h'] as const).map(bucket => (
            <Badge key={bucket} variant="outline" className={`${TAT_COLORS[bucket]} border-0 text-xs`}>
              {bucket}: {buckets[bucket] || 0}
            </Badge>
          ))}
          <Badge variant="secondary" className="text-xs">
            Total: {items.length}
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search JC# or Reg No..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pending</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="RESUBMITTED">Resubmitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Queue List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No pending approvals</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const tatBucket = getTatBucket(item.tat_minutes);
              return (
                <Card
                  key={item.spare.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setSelectedItem(item)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{item.jc_number}</span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {CLAIM_LABEL[item.spare.claim_type]}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] h-5 border-0 ${item.spare.approval_state === 'RESUBMITTED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {item.spare.approval_state}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.spare.spare_part?.part_name} × {item.spare.qty}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            {item.vehicle_reg_no}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {item.workshop_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {item.technician_name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-[10px] h-5 border-0 ${TAT_COLORS[tatBucket]}`}>
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          {formatTat(item.tat_minutes)}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Detail View ───

interface DetailViewProps {
  item: ApprovalQueueItem;
  actorUserId: string;
  onBack: () => void;
}

function ApprovalDetailView({ item, actorUserId, onBack }: DetailViewProps) {
  const [actions, setActions] = useState<SpareAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRequestInfo, setShowRequestInfo] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchSpareActions(item.spare.id).then(a => {
      setActions(a);
      setLoadingActions(false);
    });
  }, [item.spare.id]);

  const spare = item.spare;
  const part = spare.spare_part;

  const oldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE');
  const newPhotos = (spare.photos || []).filter(p => p.photo_kind === 'NEW_PART_PROOF');
  const additionalPhotos = (spare.photos || []).filter(p => p.photo_kind === 'ADDITIONAL');

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await approveSpare(spare.id, actorUserId);
      toast.success('Claim approved');
      onBack();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      await rejectSpare(spare.id, actorUserId, comment || undefined);
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
    const text = (reason || comment || '').trim();
    if (!text) {
      toast.error('Comment is required when requesting info');
      return;
    }
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

  const handleBack = () => { onBack(); };

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
              <div><span className="text-muted-foreground">Claim Type</span>
                <Badge variant="default" className="text-[10px] mt-0.5">{CLAIM_LABEL[spare.claim_type]}</Badge>
              </div>
              <div><span className="text-muted-foreground">Workshop</span><p className="font-medium">{item.workshop_name}</p></div>
              <div><span className="text-muted-foreground">Technician</span><p className="font-medium">{item.technician_name}</p></div>
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

        {/* New Part Proof (optional) */}
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
              <div className="space-y-2">
                {actions.map(action => (
                  <div key={action.id} className="flex gap-2 text-xs">
                    <ActionBadge type={action.action_type} />
                    <div className="flex-1">
                      <p className="font-medium">{action.actor?.full_name || 'Unknown'}</p>
                      {action.comment && <p className="text-muted-foreground mt-0.5">{action.comment}</p>}
                      <p className="text-muted-foreground text-[10px]">{format(new Date(action.created_at), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-2 pb-4">
          <Button className="w-full h-12" onClick={handleApprove} disabled={processing}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10" onClick={() => { setComment(''); setShowRequestInfo(true); }} disabled={processing}>
              <MessageSquare className="h-4 w-4 mr-1" />
              Request Info
            </Button>
            <Button variant="destructive" className="h-10" onClick={() => { setComment(''); setShowReject(true); }} disabled={processing}>
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        </div>
      </div>

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
        description="Optionally provide a reason for rejection."
        confirmLabel="Reject"
        variant="destructive"
        onConfirm={() => handleReject()}
        isLoading={processing}
      />
    </AppLayout>
  );
}

function ActionBadge({ type }: { type: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; className: string }> = {
    SUBMIT: { icon: Package, className: 'text-blue-600' },
    APPROVE: { icon: CheckCircle2, className: 'text-green-600' },
    REJECT: { icon: XCircle, className: 'text-red-600' },
    REQUEST_INFO: { icon: MessageSquare, className: 'text-orange-600' },
    TECH_RESPONSE: { icon: MessageSquare, className: 'text-blue-600' },
    RESUBMIT: { icon: Package, className: 'text-blue-600' },
    EDIT_RESET: { icon: AlertCircle, className: 'text-amber-600' },
  };
  const c = config[type] || { icon: AlertCircle, className: 'text-muted-foreground' };
  const Icon = c.icon;
  return (
    <div className={`shrink-0 mt-0.5 ${c.className}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
