import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  Car, 
  User, 
  Phone, 
  Gauge, 
  Calendar,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Package
} from 'lucide-react';
import { JobCard, AuditTrailEntry, JobCardStatus, STATUS_CONFIG, canTransitionTo } from '@/types';
import { useServiceCategoryNames } from '@/hooks/useServiceCategoryNames';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { OtpVerificationDialog } from '@/components/job-card/OtpVerificationDialog';
import { CompleteWorkDialog } from '@/components/job-card/CompleteWorkDialog';
import { ReopenJobCardDialog } from '@/components/job-card/ReopenJobCardDialog';
import { DeliveryWithSocDialog, OutgoingSocData } from '@/components/job-card/DeliveryWithSocDialog';
import { SparesModal } from '@/components/job-card/SparesModal';
import { SparesUsedSection } from '@/components/job-card/SparesUsedSection';
import { SubmitWarrantySheet } from '@/components/job-card/SubmitWarrantySheet';
import { SubmitAllWarrantySheet } from '@/components/job-card/SubmitAllWarrantySheet';
import { NeedsInfoResponseSheet } from '@/components/job-card/NeedsInfoResponseSheet';
import { useSparesFeatureFlags, useJobCardSpares, deleteJobCardSpare, withdrawSpare, convertToUserPaid } from '@/hooks/useSparesFlow';
import { uploadJcImage } from '@/lib/upload-jc-image';
import { sendSms } from '@/lib/sms';
import { JobCardSpare } from '@/types';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { resolve: resolveCategoryName } = useServiceCategoryNames();
  
  const [jobCard, setJobCard] = useState<JobCard | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  
  // Spares
  const { sparesEnabled, warrantyEnabled } = useSparesFeatureFlags();
  const { spares, isLoading: sparesLoading, refetch: refetchSpares } = useJobCardSpares(id);
  const [showSparesModal, setShowSparesModal] = useState(false);
  const [mandatorySparesRequired, setMandatorySparesRequired] = useState(false);
  const [sparesModalFromStartWork, setSparesModalFromStartWork] = useState(false);
  const [editingSpare, setEditingSpare] = useState<JobCardSpare | null>(null);
  const [deletingSpareId, setDeletingSpareId] = useState<string | null>(null);
  const [warrantySpare, setWarrantySpare] = useState<JobCardSpare | null>(null);
  const [withdrawingSpare, setWithdrawingSpare] = useState<JobCardSpare | null>(null);
  const [needsInfoSpare, setNeedsInfoSpare] = useState<JobCardSpare | null>(null);
  const [showSubmitAll, setShowSubmitAll] = useState(false);
  // Dialog states
  const [showInwardingOtp, setShowInwardingOtp] = useState(false);
  const [showDeliveryOtp, setShowDeliveryOtp] = useState(false);
  const [showCompleteWork, setShowCompleteWork] = useState(false);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [pendingOutSocData, setPendingOutSocData] = useState<OutgoingSocData | null>(null);

  useEffect(() => {
    if (id) {
      fetchJobCard();
      fetchAuditTrail();
    }
  }, [id]);

  // Check if any selected issues require spares (child rows with requires_spares = true)
  useEffect(() => {
    const checkMandatorySpares = async () => {
      if (!jobCard || !sparesEnabled || jobCard.issue_categories.length === 0) {
        setMandatorySparesRequired(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('service_categories')
          .select('code')
          .in('code', jobCard.issue_categories)
          .eq('requires_spares', true)
          .not('parent_code', 'is', null)
          .limit(1);
        setMandatorySparesRequired((data?.length ?? 0) > 0);
      } catch {
        setMandatorySparesRequired(false);
      }
    };
    checkMandatorySpares();
  }, [jobCard?.issue_categories, sparesEnabled]);

  const fetchJobCard = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('job_cards')
        .select(`
          *,
          vehicle:vehicles(*),
          creator:profiles!job_cards_created_by_fkey(full_name, email, phone),
          workshop:workshops(name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setJobCard({
        ...data,
        status: data.status as JobCardStatus,
      } as unknown as JobCard);
    } catch (error) {
      console.error('Error fetching job card:', error);
      toast.error('Failed to load job card');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditTrail = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('audit_trail')
        .select(`
          *,
          user:profiles!audit_trail_user_id_fkey(full_name)
        `)
        .eq('job_card_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setAuditTrail((data || []).map(item => ({
        ...item,
        from_status: item.from_status as JobCardStatus | null,
        to_status: item.to_status as JobCardStatus,
      })) as AuditTrailEntry[]);
    } catch (error) {
      console.error('Error fetching audit trail:', error);
    }
  };

  const updateStatus = async (newStatus: JobCardStatus, additionalData?: Partial<JobCard>, auditNotes?: string) => {
    if (!jobCard || !profile) return;
    
    setIsUpdating(true);
    try {
      // Build additional data payload for the RPC
      const additionalPayload: Record<string, any> = {};
      if (additionalData?.inwarding_otp_verified !== undefined) additionalPayload.inwarding_otp_verified = additionalData.inwarding_otp_verified;
      if (additionalData?.delivery_otp_verified !== undefined) additionalPayload.delivery_otp_verified = additionalData.delivery_otp_verified;
      if (additionalData?.completion_remarks !== undefined) additionalPayload.completion_remarks = additionalData.completion_remarks;
      if (additionalData?.service_categories) additionalPayload.service_categories = additionalData.service_categories;
      if (additionalData?.issue_categories) additionalPayload.issue_categories = additionalData.issue_categories;

      const { data, error } = await supabase.rpc('transition_job_card_status', {
        p_job_card_id: jobCard.id,
        p_new_status: newStatus,
        p_notes: auditNotes || null,
        p_additional_data: Object.keys(additionalPayload).length > 0 ? additionalPayload : null,
      });

      if (error) {
        // Surface user-safe messages for known error types
        const msg = error.message || '';
        if (msg.includes('INVALID_TRANSITION')) {
          toast.error('This status change is not allowed from the current state.');
        } else if (msg.includes('UNAUTHORIZED')) {
          toast.error('You are not authorized to update this job card.');
        } else if (msg.includes('NOT_FOUND')) {
          toast.error('Job card not found.');
        } else {
          toast.error('Failed to update job card');
        }
        console.error('Transition RPC error:', error);
        return;
      }

      toast.success(`Job card moved to ${STATUS_CONFIG[newStatus].label}`);
      fetchJobCard();
      fetchAuditTrail();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update job card');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartWork = () => {
    if (jobCard && canTransitionTo(jobCard.status, 'IN_PROGRESS')) {
      if (sparesEnabled) {
        setSparesModalFromStartWork(true);
        setShowSparesModal(true);
      } else {
        updateStatus('IN_PROGRESS');
      }
    }
  };

  const handleSparesModalSaved = () => {
    refetchSpares();
  };

  const handleEditSpare = (spare: JobCardSpare) => {
    // Block editing non-DRAFT spares
    if (spare.approval_state !== 'DRAFT') {
      toast.error('Claim submitted. Withdraw to make changes.');
      return;
    }
    setEditingSpare(spare);
    setShowSparesModal(true);
  };

  const handleDeleteSpare = async () => {
    if (!deletingSpareId) return;
    // Find the spare to check state
    const spare = spares.find(s => s.id === deletingSpareId);
    if (spare && spare.approval_state !== 'DRAFT') {
      toast.error('Cannot delete a submitted spare. Withdraw first.');
      setDeletingSpareId(null);
      return;
    }
    try {
      await deleteJobCardSpare(deletingSpareId);
      toast.success('Spare removed');
      refetchSpares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete spare');
    } finally {
      setDeletingSpareId(null);
    }
  };

  const handleWithdrawSpare = async () => {
    if (!withdrawingSpare || !profile) return;
    try {
      await withdrawSpare(withdrawingSpare.id, profile.id);
      toast.success('Submission withdrawn. You can now edit this spare.');
      refetchSpares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to withdraw');
    } finally {
      setWithdrawingSpare(null);
    }
  };

  const handleConvertToUserPaid = async (spare: JobCardSpare) => {
    if (!profile) return;
    try {
      await convertToUserPaid(spare.id, profile.id);
      toast.success('Converted to User Paid');
      refetchSpares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert');
    }
  };

  const handleCompleteWork = async (remarks: string) => {
    if (!jobCard || !canTransitionTo(jobCard.status, 'READY')) return;

    updateStatus('READY', { completion_remarks: remarks });
    sendSms({ jobCardId: jobCard.id, trigger: 'READY' });
    setShowCompleteWork(false);
  };

  const handleInwardingVerified = () => {
    if (jobCard) {
      updateStatus('INWARDED', { inwarding_otp_verified: true });
      sendSms({ jobCardId: jobCard.id, trigger: 'INWARDED' });
    }
    setShowInwardingOtp(false);
  };

  const handleDeliveryVerified = async () => {
    if (jobCard && pendingOutSocData) {
      setIsUpdating(true);
      try {
        // Upload outgoing SOC image
        const outSocUrl = await uploadJcImage(pendingOutSocData.file, jobCard.id, 'outgoing_soc');

        // Save outgoing SOC data
        await supabase
          .from('job_cards')
          .update({
            out_soc_value: pendingOutSocData.value,
            out_soc_photo_url: outSocUrl,
            out_soc_detected_value: pendingOutSocData.validation?.ocr?.socReading ?? null,
            out_soc_detection_confidence: pendingOutSocData.validation?.ocr?.confidence ?? null,
            out_soc_override_reason: pendingOutSocData.mismatchConfirmed ? pendingOutSocData.mismatchReason : null,
            out_soc_override_comment: pendingOutSocData.mismatchConfirmed ? pendingOutSocData.mismatchComment : null,
            out_soc_anomaly_flag: false,
          } as any)
          .eq('id', jobCard.id);

        await updateStatus('DELIVERED', { delivery_otp_verified: true });
        const result = await sendSms({ jobCardId: jobCard.id, trigger: 'DELIVERED' });
        if (result?.auto_completed) {
          fetchJobCard();
          fetchAuditTrail();
        }
      } catch (err) {
        console.error('Error saving outgoing SOC:', err);
        toast.error('Failed to save outgoing SOC data');
      } finally {
        setIsUpdating(false);
        setPendingOutSocData(null);
      }
    }
    setShowDeliveryOtp(false);
  };

  // ONLY Super admins bypass OTP for inwarding (country_admin cannot skip)
  const handleInwardingAction = () => {
    if (profile?.role === 'super_admin') {
      if (jobCard) {
        updateStatus('INWARDED', { inwarding_otp_verified: true }, 'Super admin bypass – OTP skipped');
        sendSms({ jobCardId: jobCard.id, trigger: 'INWARDED' });
      }
    } else {
      setShowInwardingOtp(true);
    }
  };

  // Delivery: always go through outgoing SOC dialog first, then OTP
  const handleDeliveryAction = () => {
    if (profile?.role === 'super_admin') {
      // Super admin still needs to capture outgoing SOC
      setShowDeliveryConfirm(true);
    } else {
      setShowDeliveryConfirm(true);
    }
  };

  const handleOutgoingSocProceed = (socData: OutgoingSocData) => {
    setPendingOutSocData(socData);
    setShowDeliveryConfirm(false);
    if (profile?.role === 'super_admin') {
      // Super admin bypasses OTP — go straight to delivery
      handleSuperAdminDeliveryWithSoc(socData);
    } else {
      setShowDeliveryOtp(true);
    }
  };

  const handleSuperAdminDeliveryWithSoc = async (socData: OutgoingSocData) => {
    if (!jobCard) return;
    setIsUpdating(true);
    try {
      const outSocUrl = await uploadJcImage(socData.file, jobCard.id, 'outgoing_soc');
      await supabase
        .from('job_cards')
        .update({
          out_soc_value: socData.value,
          out_soc_photo_url: outSocUrl,
          out_soc_detected_value: socData.validation?.ocr?.socReading ?? null,
          out_soc_detection_confidence: socData.validation?.ocr?.confidence ?? null,
          out_soc_override_reason: socData.mismatchConfirmed ? socData.mismatchReason : null,
          out_soc_override_comment: socData.mismatchConfirmed ? socData.mismatchComment : null,
          out_soc_anomaly_flag: false,
        } as any)
        .eq('id', jobCard.id);

      await updateStatus('DELIVERED', { delivery_otp_verified: true }, 'Super admin bypass – OTP skipped');
      const result = await sendSms({ jobCardId: jobCard.id, trigger: 'DELIVERED' });
      if (result?.auto_completed) {
        fetchJobCard();
        fetchAuditTrail();
      }
    } catch (err) {
      console.error('Error saving outgoing SOC:', err);
      toast.error('Failed to save outgoing SOC data');
    } finally {
      setIsUpdating(false);
      setPendingOutSocData(null);
    }
  };

  const handleReopenJobCard = (serviceCategories: string[], issueCategories: string[], comments: string) => {
    if (jobCard && canTransitionTo(jobCard.status, 'REOPENED')) {
      updateStatus('REOPENED', {
        service_categories: [...jobCard.service_categories, ...serviceCategories],
        issue_categories: [...jobCard.issue_categories, ...issueCategories],
      }, comments);
      sendSms({ jobCardId: jobCard.id, trigger: 'REOPENED' });
    }
    setShowReopenDialog(false);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="Job Card" showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!jobCard) {
    return (
      <AppLayout>
        <PageHeader title="Job Card" showBack />
        <div className="p-4">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Job card not found</p>
              <Button className="mt-4" onClick={() => navigate('/')}>
                Back to Job Cards
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const vehicle = jobCard.vehicle;

  return (
    <AppLayout>
      <PageHeader 
        title={jobCard.jc_number}
        subtitle={vehicle?.reg_no}
        showBack
      />
      
      <div className="p-4 space-y-4">
        {/* Status Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <div className="mt-1">
                  <StatusPill status={jobCard.status} size="md" />
                </div>
              </div>
              {jobCard.updated_at && (
                <div className="text-right text-sm text-muted-foreground">
                  <p>Last updated</p>
                  <p className="font-medium text-foreground">
                    {formatDistanceToNow(new Date(jobCard.updated_at), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <ActionButtons 
          jobCard={jobCard}
          isUpdating={isUpdating}
          onSendInwardingOtp={handleInwardingAction}
          onStartWork={handleStartWork}
          onCompleteWork={() => setShowCompleteWork(true)}
          onConfirmDelivery={handleDeliveryAction}
          onReopenJobCard={() => setShowReopenDialog(true)}
          sparesEnabled={sparesEnabled}
          sparesCount={spares.length}
          mandatorySparesRequired={mandatorySparesRequired}
          onAddSpares={() => { setEditingSpare(null); setShowSparesModal(true); }}
        />

        {/* Vehicle & Customer Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Registration</span>
                <p className="font-medium">{vehicle?.reg_no || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Model</span>
                <p className="font-medium">{vehicle?.model || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Color</span>
                <p className="font-medium">{vehicle?.color || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Odometer</span>
                <p className="font-medium flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  {jobCard.odometer.toLocaleString()} km
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{vehicle?.owner_name || 'Unknown'}</span>
                <span className="text-xs text-muted-foreground">(Owner)</span>
              </div>
              {vehicle?.owner_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${vehicle.owner_phone}`}
                    className="text-primary hover:underline"
                  >
                    {vehicle.owner_phone}
                  </a>
                </div>
              )}

              {/* Show rider contact when alternate phone is active */}
              {(jobCard as any).contact_for_updates === 'RIDER' && (jobCard as any).rider_name && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-medium">{(jobCard as any).rider_name}</span>
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Rider — OTP & Updates</span>
                  </div>
                   {(jobCard as any).rider_phone && (
                     <div className="flex items-center gap-2 text-sm">
                       <Phone className="h-4 w-4 text-primary" />
                       <a 
                         href={`tel:${(jobCard as any).rider_phone}`}
                         className="text-primary hover:underline"
                       >
                         {(jobCard as any).rider_phone}
                       </a>
                     </div>
                   )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobCard.service_categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {jobCard.service_categories.map((cat, i) => (
                  <span 
                    key={i}
                    className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium"
                  >
                    {resolveCategoryName(cat)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No services selected</p>
            )}

            {jobCard.issue_categories.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground mb-2">Issues</p>
                <div className="flex flex-wrap gap-2">
                  {jobCard.issue_categories.map((issue, i) => (
                    <span 
                      key={i}
                      className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs"
                    >
                      {resolveCategoryName(issue)}
                    </span>
                  ))}
                </div>
              </>
            )}

            {jobCard.completion_remarks && (
              <>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground mb-1">Completion Remarks</p>
                <p className="text-sm">{jobCard.completion_remarks}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Spares Used Section */}
        {sparesEnabled && (
          <SparesUsedSection
            spares={spares}
            isLoading={sparesLoading}
            onAddSpares={() => { setEditingSpare(null); setShowSparesModal(true); }}
            onEditSpare={handleEditSpare}
            onDeleteSpare={(id) => setDeletingSpareId(id)}
            onSubmitWarranty={warrantyEnabled ? (spare) => setWarrantySpare(spare) : undefined}
            onWithdrawSpare={(spare) => setWithdrawingSpare(spare)}
            onRespondNeedsInfo={(spare) => setNeedsInfoSpare(spare)}
            onConvertToUserPaid={warrantyEnabled ? handleConvertToUserPaid : undefined}
            canEdit={jobCard.status === 'IN_PROGRESS' || jobCard.status === 'REOPENED'}
            warrantyEnabled={warrantyEnabled}
          />
        )}

        {/* Timeline */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer"
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timeline
              </CardTitle>
              {showTimeline ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            <CardDescription>
              {auditTrail.length} status change{auditTrail.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          {showTimeline && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {auditTrail.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      </div>
                      {i < auditTrail.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2">
                        <StatusPill status={entry.to_status} size="sm" />
                        {entry.from_status && (
                          <span className="text-xs text-muted-foreground">
                            from {STATUS_CONFIG[entry.from_status].label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(entry.user as any)?.full_name || 'System'} • {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                      </p>
                      {entry.notes && (
                        <p className="text-sm mt-1">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Creation entry */}
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                      <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Job Card Created</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(jobCard.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Dialogs */}
      <OtpVerificationDialog
        open={showInwardingOtp}
        onOpenChange={setShowInwardingOtp}
        jobCard={jobCard}
        purpose="inwarding"
        onVerified={handleInwardingVerified}
      />

      <OtpVerificationDialog
        open={showDeliveryOtp}
        onOpenChange={setShowDeliveryOtp}
        jobCard={jobCard}
        purpose="delivery"
        onVerified={handleDeliveryVerified}
      />

      <CompleteWorkDialog
        open={showCompleteWork}
        onOpenChange={setShowCompleteWork}
        jobCard={jobCard}
        onComplete={handleCompleteWork}
        sparesEnabled={sparesEnabled}
        spares={spares}
        warrantyEnabled={warrantyEnabled}
        onOpenSparesModal={() => setShowSparesModal(true)}
      />

      <ReopenJobCardDialog
        open={showReopenDialog}
        onOpenChange={setShowReopenDialog}
        onReopen={handleReopenJobCard}
      />

      <DeliveryWithSocDialog
        open={showDeliveryConfirm}
        onOpenChange={setShowDeliveryConfirm}
        onProceed={handleOutgoingSocProceed}
      />

      {jobCard && sparesEnabled && (
        <SparesModal
          open={showSparesModal}
          onOpenChange={(open) => {
            setShowSparesModal(open);
            if (!open) {
              setEditingSpare(null);
              if (sparesModalFromStartWork) {
                setSparesModalFromStartWork(false);
                updateStatus('IN_PROGRESS');
              }
            }
          }}
          jobCardId={jobCard.id}
          profileId={profile?.id || ''}
          vehicleModel={jobCard.vehicle?.model}
          vehicleColorCode={(jobCard.vehicle as any)?.color_code}
          warrantyEnabled={warrantyEnabled}
          onSaved={handleSparesModalSaved}
          editingSpare={editingSpare}
        />
      )}

      {/* Submit Warranty Sheet */}
      {warrantySpare && (
        <SubmitWarrantySheet
          open={!!warrantySpare}
          onOpenChange={(open) => { if (!open) setWarrantySpare(null); }}
          spare={warrantySpare}
          jobCardId={jobCard.id}
          profileId={profile?.id || ''}
          jobCard={jobCard}
          onSubmitted={() => { setWarrantySpare(null); refetchSpares(); }}
        />
      )}

      {/* Delete spare confirmation */}
      <ConfirmationDialog
        open={!!deletingSpareId}
        onOpenChange={(open) => { if (!open) setDeletingSpareId(null); }}
        title="Delete Spare"
        description="Are you sure you want to remove this spare part? This action cannot be undone."
        onConfirm={handleDeleteSpare}
        confirmLabel="Delete"
        variant="destructive"
      />

      {/* Withdraw spare confirmation */}
      <ConfirmationDialog
        open={!!withdrawingSpare}
        onOpenChange={(open) => { if (!open) setWithdrawingSpare(null); }}
        title="Withdraw submission?"
        description="This claim is already submitted. Withdrawing will reset the submission so you can edit the part/qty/type. Old-part evidence photos and serial will be cleared. Continue?"
        onConfirm={handleWithdrawSpare}
        confirmLabel="Withdraw"
        variant="destructive"
      />

      {/* Needs Info Response Sheet */}
      {needsInfoSpare && profile && (
        <NeedsInfoResponseSheet
          open={!!needsInfoSpare}
          onOpenChange={(open) => { if (!open) setNeedsInfoSpare(null); }}
          spare={needsInfoSpare}
          jobCardId={jobCard.id}
          profileId={profile.id}
          userId={profile.user_id}
          onResponded={() => { setNeedsInfoSpare(null); refetchSpares(); }}
        />
      )}
    </AppLayout>
  );
}

interface ActionButtonsProps {
  jobCard: JobCard;
  isUpdating: boolean;
  onSendInwardingOtp: () => void;
  onStartWork: () => void;
  onCompleteWork: () => void;
  onConfirmDelivery: () => void;
  onReopenJobCard: () => void;
  sparesEnabled?: boolean;
  sparesCount?: number;
  mandatorySparesRequired?: boolean;
  onAddSpares?: () => void;
}

function ActionButtons({ 
  jobCard, 
  isUpdating,
  onSendInwardingOtp,
  onStartWork,
  onCompleteWork,
  onConfirmDelivery,
  onReopenJobCard,
  sparesEnabled,
  sparesCount = 0,
  mandatorySparesRequired,
  onAddSpares,
}: ActionButtonsProps) {
  const status = jobCard.status;

  if (status === 'DRAFT') {
    return (
      <Button 
        className="w-full h-12 text-base"
        onClick={onSendInwardingOtp}
        disabled={isUpdating}
      >
        Send Inwarding OTP
      </Button>
    );
  }

  if (status === 'INWARDED' || status === 'REOPENED') {
    return (
      <Button 
        className="w-full h-12 text-base"
        onClick={onStartWork}
        disabled={isUpdating}
      >
        Start Work
      </Button>
    );
  }

  if (status === 'IN_PROGRESS') {
    return (
      <div className="space-y-3">
        {sparesEnabled && mandatorySparesRequired && sparesCount === 0 && onAddSpares && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">
              Spares required for selected issues. Please add spares to complete work.
            </p>
            <Button variant="destructive" size="sm" className="shrink-0 h-7 text-xs" onClick={onAddSpares}>
              <Package className="h-3.5 w-3.5 mr-1" />
              Add Spares
            </Button>
          </div>
        )}
        <Button 
          className="w-full h-12 text-base"
          onClick={onCompleteWork}
          disabled={isUpdating}
        >
          Complete Work
        </Button>
      </div>
    );
  }

  if (status === 'READY') {
    return (
      <div className="space-y-3">
        <Button 
          className="w-full h-12 text-base"
          onClick={onConfirmDelivery}
          disabled={isUpdating}
        >
          Confirm Delivery
        </Button>
        <Button 
          variant="outline"
          className="w-full h-12 text-base"
          onClick={onReopenJobCard}
          disabled={isUpdating}
        >
          Reopen Job Card
        </Button>
      </div>
    );
  }

  if (status === 'DELIVERED') {
    return (
      <Card className="bg-success/10 border-success/20">
        <CardContent className="py-4 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-success mb-2" />
          <p className="font-medium text-success">Vehicle Delivered</p>
          <p className="text-sm text-muted-foreground mt-1">
            Awaiting customer feedback — auto-completes in 2 days
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'COMPLETED') {
    return (
      <Card className="bg-muted">
        <CardContent className="py-4 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium">Completed</p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'CLOSED') {
    return (
      <Card className="bg-muted">
        <CardContent className="py-4 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium">Job Card Closed</p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
