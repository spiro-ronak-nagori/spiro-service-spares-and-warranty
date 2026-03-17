import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRbacPermissions } from '@/hooks/useRbacPermissions';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2 } from
'lucide-react';
import { JobCard, AuditTrailEntry, JobCardStatus, STATUS_CONFIG, canTransitionTo } from '@/types';
import { useServiceCategoryNames } from '@/hooks/useServiceCategoryNames';
import { format } from 'date-fns';
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
import { useCountryBoolSetting } from '@/hooks/useCountrySetting';
import { resolveChecklistTemplate } from '@/lib/resolve-checklist-template';
import { uploadJcImage } from '@/lib/upload-jc-image';
import { sendSms } from '@/lib/sms';
import { JobCardSpare } from '@/types';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { VehicleChecklistSheet } from '@/components/job-card/VehicleChecklistSheet';
import { EditIssuesSheet } from '@/components/job-card/EditIssuesSheet';
import { ServiceDetailsSection } from '@/components/job-card/ServiceDetailsSection';
import { WorkExecutionSection } from '@/components/job-card/WorkExecutionSection';
import { AddLabourSheet } from '@/components/job-card/AddLabourSheet';
import { AggregatedLabourRow } from '@/components/job-card/LabourSubsection';
import { useJobCardLabour, useLabourMaster, addJobCardLabour, updateJobCardLabour, deleteJobCardLabour, JobCardLabourEntry } from '@/hooks/useLabour';
// ChecklistStatusSection removed — checklist is now CTA-driven only
import { VehicleDetailsCard } from '@/components/job-card/VehicleDetailsCard';
import { MechanicNameSheet } from '@/components/job-card/MechanicNameSheet';

export default function JobCardDetailPage() {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { resolve: resolveCategoryName, getParentCode } = useServiceCategoryNames();

  const [jobCard, setJobCard] = useState<JobCard | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [hasSetDefaultSection, setHasSetDefaultSection] = useState(false);
  const toggleSection = (section: string) => setExpandedSection(prev => prev === section ? null : section);
  // Auto-expand: vehicle by default, or service if few items
  useEffect(() => {
    if (jobCard && !hasSetDefaultSection) {
      const total = (jobCard.service_categories?.length || 0) + (jobCard.issue_categories?.length || 0);
      if (total > 0 && total < 6) {
        setExpandedSection('service');
      } else {
        setExpandedSection('vehicle');
      }
      setHasSetDefaultSection(true);
    }
  }, [jobCard, hasSetDefaultSection]);

  // Derive workshop country early (may be null until job card loads)
  const workshopCountry = (jobCard as any)?.workshop?.country || null;
  const workshopType = (jobCard as any)?.workshop?.type || null;

  // RBAC permissions — scoped to the JC's workshop type + country for COCO/FOFO overlays
  const { can } = useRbacPermissions(workshopType, workshopCountry);

  // Spares (country-aware)
  const { sparesEnabled, warrantyEnabled } = useSparesFeatureFlags(workshopCountry);
  const { spares, isLoading: sparesLoading, refetch: refetchSpares } = useJobCardSpares(id);
  const [showSparesModal, setShowSparesModal] = useState(false);
  const [mandatorySparesRequired, setMandatorySparesRequired] = useState(false);
  const [editingSpare, setEditingSpare] = useState<JobCardSpare | null>(null);
  const [deletingSpareId, setDeletingSpareId] = useState<string | null>(null);
  const [warrantySpare, setWarrantySpare] = useState<JobCardSpare | null>(null);
  const [withdrawingSpare, setWithdrawingSpare] = useState<JobCardSpare | null>(null);
  const [needsInfoSpare, setNeedsInfoSpare] = useState<JobCardSpare | null>(null);
  const [showSubmitAll, setShowSubmitAll] = useState(false);

  // Country-based feature flags (reads from country_settings)
  const { value: checklistEnabledForThisJC, isLoading: checklistFlagLoading } = useCountryBoolSetting('ENABLE_VEHICLE_CHECKLIST', workshopCountry);
  const { value: mechanicNameEnabledForThisJC, isLoading: mechanicFlagLoading } = useCountryBoolSetting('ENABLE_MECHANIC_NAME', workshopCountry);
  const { value: labourEnabledForThisJC } = useCountryBoolSetting('ENABLE_LABOUR', workshopCountry);

  // Labour — depends on Spares Flow being ON + Labour being ON
  const labourActive = sparesEnabled && labourEnabledForThisJC;
  const { entries: labourEntries, isLoading: labourLoading, refetch: refetchLabour } = useJobCardLabour(id);
  const { items: labourCatalogue } = useLabourMaster(labourActive ? workshopCountry : null);
  const [showLabourSheet, setShowLabourSheet] = useState(false);
  const [editingLabourRow, setEditingLabourRow] = useState<AggregatedLabourRow | null>(null);
  const [isSavingLabour, setIsSavingLabour] = useState(false);
  const [deletingLabourRow, setDeletingLabourRow] = useState<AggregatedLabourRow | null>(null);

  const LABOUR_EDITABLE_STATUSES: JobCardStatus[] = ['IN_PROGRESS', 'REOPENED'];
  const canEditLabourInJc = jobCard ? LABOUR_EDITABLE_STATUSES.includes(jobCard.status) : false;

  const handleSaveLabour = async (data: { labourMasterId: string; durationMinutes: number; rate: number | null; remarks: string | null }) => {
    if (!jobCard || !profile) return;
    setIsSavingLabour(true);
    try {
      if (editingLabourRow) {
        // Editing aggregated row: update the primary entry with total duration, delete extras
        const primaryId = editingLabourRow.primaryEntry.id;
        await updateJobCardLabour(primaryId, {
          duration_minutes: data.durationMinutes,
          rate: data.rate,
          remarks: data.remarks,
        }, profile.id, jobCard.id);
        // Remove duplicate entries (keep only primary)
        for (const extraId of editingLabourRow.entryIds.slice(1)) {
          await deleteJobCardLabour(extraId, profile.id, jobCard.id);
        }
        toast.success('Labour updated');
      } else {
        // Adding: check if same type already exists — aggregate by updating existing
        const existingOfType = labourEntries.filter(e => e.labour_master_id === data.labourMasterId);
        if (existingOfType.length > 0) {
          // Add duration to the first existing entry
          const primary = existingOfType[0];
          const totalExisting = existingOfType.reduce((s, e) => s + e.duration_minutes, 0);
          await updateJobCardLabour(primary.id, {
            duration_minutes: totalExisting + data.durationMinutes,
            rate: data.rate ?? primary.rate,
            remarks: data.remarks
              ? (primary.remarks ? `${primary.remarks}; ${data.remarks}` : data.remarks)
              : primary.remarks,
          }, profile.id, jobCard.id);
          // Consolidate: remove extra entries
          for (const extra of existingOfType.slice(1)) {
            await deleteJobCardLabour(extra.id, profile.id, jobCard.id);
          }
          toast.success('Labour updated');
        } else {
          await addJobCardLabour(jobCard.id, data.labourMasterId, data.durationMinutes, data.rate, data.remarks, profile.id);
          toast.success('Labour added');
        }
      }
      setShowLabourSheet(false);
      setEditingLabourRow(null);
      refetchLabour();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save labour');
    } finally {
      setIsSavingLabour(false);
    }
  };

  const handleDeleteLabourRow = async () => {
    if (!deletingLabourRow || !profile || !jobCard) return;
    try {
      // Delete all entries for this aggregated row
      for (const entryId of deletingLabourRow.entryIds) {
        await deleteJobCardLabour(entryId, profile.id, jobCard.id);
      }
      toast.success('Labour removed');
      setDeletingLabourRow(null);
      refetchLabour();
    } catch (err: any) {
      toast.error('Failed to remove labour');
    }
  };

  // Checklist — read from persisted column
  const [showChecklist, setShowChecklist] = useState(false);
  // If checklist_status is already persisted in DB, we don't need to wait for the feature flag
  const persistedChecklistStatusRaw = jobCard ? (jobCard as any).checklist_status as string | null : null;
  const [checklistStatusResolved, setChecklistStatusResolved] = useState(false);

  // Mechanic name
  const [showMechanicSheet, setShowMechanicSheet] = useState(false);
  const [mechanicSheetForStartWork, setMechanicSheetForStartWork] = useState(false);
  const [isSavingMechanic, setIsSavingMechanic] = useState(false);

  // Dialog states
  const [showInwardingOtp, setShowInwardingOtp] = useState(false);
  const [showDeliveryOtp, setShowDeliveryOtp] = useState(false);
  const [showCompleteWork, setShowCompleteWork] = useState(false);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [pendingOutSocData, setPendingOutSocData] = useState<OutgoingSocData | null>(null);
  const [showEditIssues, setShowEditIssues] = useState(false);
  const [isSavingIssues, setIsSavingIssues] = useState(false);

  // Mechanic notes: can add when mechanic is assigned and status is editable
  const MECHANIC_NOTE_STATUSES: JobCardStatus[] = ['IN_PROGRESS', 'REOPENED'];
  const canAddMechanicNote = jobCard ? mechanicNameEnabledForThisJC && !!(jobCard as any).assigned_mechanic_name && MECHANIC_NOTE_STATUSES.includes(jobCard.status) : false;

  const handleAddMechanicNote = async (note: string) => {
    if (!jobCard || !profile) return;
    const existing = (jobCard as any).mechanic_notes as string | null;
    const timestamp = format(new Date(), 'dd MMM HH:mm');
    const entry = `[${timestamp}] ${note}`;
    const updated = existing ? `${existing}\n${entry}` : entry;

    const { error } = await supabase
      .from('job_cards')
      .update({ mechanic_notes: updated } as any)
      .eq('id', jobCard.id);

    if (error) {
      toast.error('Failed to save note');
      throw error;
    }

    await supabase.from('audit_trail').insert({
      job_card_id: jobCard.id,
      user_id: profile.id,
      from_status: jobCard.status,
      to_status: jobCard.status,
      notes: JSON.stringify({ event: 'MECHANIC_NOTE_ADDED', note }),
    });

    toast.success('Note added');
    fetchJobCard();
  };

  // Issue editing allowed: after inwarding, before work completed, or after reopen
  const ISSUE_EDITABLE_STATUSES: JobCardStatus[] = ['DRAFT', 'INWARDED', 'IN_PROGRESS', 'REOPENED'];
  const canEditIssues = jobCard ? ISSUE_EDITABLE_STATUSES.includes(jobCard.status) : false;

  // Mechanic name editability: editable from INWARDED until READY, and again if REOPENED
  const MECHANIC_EDITABLE_STATUSES: JobCardStatus[] = ['INWARDED', 'IN_PROGRESS', 'REOPENED'];
  const canEditMechanic = jobCard ? mechanicNameEnabledForThisJC && MECHANIC_EDITABLE_STATUSES.includes(jobCard.status) : false;
  

  const handleSaveIssues = async (newServiceCategories: string[], newIssueCategories: string[], newMechanicName?: string) => {
    if (!jobCard || !profile || !canEditIssues) {
      toast.error('Issue editing is not allowed in the current status');
      return;
    }

    setIsSavingIssues(true);
    try {
      const { data: freshJc, error: fetchErr } = await supabase.
      from('job_cards').
      select('status, service_categories, issue_categories').
      eq('id', jobCard.id).
      single();

      if (fetchErr) throw fetchErr;
      if (!ISSUE_EDITABLE_STATUSES.includes(freshJc.status as JobCardStatus)) {
        toast.error('Job card status has changed. Issue editing is no longer allowed.');
        setShowEditIssues(false);
        fetchJobCard();
        return;
      }

      const oldServiceCats = freshJc.service_categories as string[];
      const oldIssueCats = freshJc.issue_categories as string[];
      const addedIssues = newIssueCategories.filter((c) => !oldIssueCats.includes(c));
      const removedIssues = oldIssueCats.filter((c) => !newIssueCategories.includes(c));
      const addedServices = newServiceCategories.filter((c) => !oldServiceCats.includes(c));
      const removedServices = oldServiceCats.filter((c) => !newServiceCategories.includes(c));

      const updatePayload: Record<string, any> = {
        service_categories: newServiceCategories,
        issue_categories: newIssueCategories,
      };

      if (newMechanicName !== undefined) {
        updatePayload.assigned_mechanic_name = newMechanicName || null;
      }

      const hasIssueChanges = addedIssues.length > 0 || removedIssues.length > 0 || addedServices.length > 0 || removedServices.length > 0;
      const hasMechanicChanges = newMechanicName !== undefined && newMechanicName !== ((jobCard as any).assigned_mechanic_name || '');

      if (!hasIssueChanges && !hasMechanicChanges) {
        setShowEditIssues(false);
        return;
      }

      const { error: updateErr } = await supabase.
      from('job_cards').
      update(updatePayload as any).
      eq('id', jobCard.id);

      if (updateErr) throw updateErr;

      const auditNotes = JSON.stringify({
        event: 'SERVICE_DETAILS_UPDATED',
        status_at_edit: freshJc.status,
        ...(hasIssueChanges ? {
          old_services: oldServiceCats,
          new_services: newServiceCategories,
          old_issues: oldIssueCats,
          new_issues: newIssueCategories,
          added_issues: addedIssues,
          removed_issues: removedIssues,
          added_services: addedServices,
          removed_services: removedServices,
        } : {}),
        ...(hasMechanicChanges ? { mechanic_name_changed: true } : {}),
      });

      await supabase.from('audit_trail').insert({
        job_card_id: jobCard.id,
        user_id: profile.id,
        from_status: freshJc.status,
        to_status: freshJc.status,
        notes: auditNotes
      });

      toast.success('Service details updated');
      setShowEditIssues(false);
      fetchJobCard();
      fetchAuditTrail();
    } catch (error: any) {
      console.error('Error updating issues:', error);
      toast.error(error?.message || 'Failed to update issues');
    } finally {
      setIsSavingIssues(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchJobCard();
      fetchAuditTrail();
    }
  }, [id]);

  // Check if any selected issues require spares
  useEffect(() => {
    const checkMandatorySpares = async () => {
      if (!jobCard || !sparesEnabled || jobCard.issue_categories.length === 0) {
        setMandatorySparesRequired(false);
        return;
      }
      try {
        const { data } = await supabase.
        from('service_categories').
        select('code').
        in('code', jobCard.issue_categories).
        eq('requires_spares', true).
        not('parent_code', 'is', null).
        limit(1);
        setMandatorySparesRequired((data?.length ?? 0) > 0);
      } catch {
        setMandatorySparesRequired(false);
      }
    };
    checkMandatorySpares();
  }, [jobCard?.issue_categories, sparesEnabled]);

  // Resolve checklist_status for INWARDED job cards where it's still NULL
  // Only needs feature flag when checklist_status is not yet persisted
  useEffect(() => {
    if (!id || !jobCard || checklistStatusResolved) return;
    const currentChecklistStatus = (jobCard as any).checklist_status;

    // If already persisted, nothing to do — instant resolution
    if (currentChecklistStatus) {
      setChecklistStatusResolved(true);
      return;
    }

    // Only resolve for INWARDED status (other statuses with NULL = legacy NOT_APPLICABLE)
    if (jobCard.status !== 'INWARDED') {
      setChecklistStatusResolved(true);
      return;
    }

    // For NULL status on INWARDED cards, we need the feature flag to decide
    if (checklistFlagLoading) return;

    // If feature flag is off, persist NOT_APPLICABLE
    if (!checklistEnabledForThisJC) {
      (async () => {
        await supabase.from('job_cards').update({ checklist_status: 'NOT_APPLICABLE' } as any).eq('id', id);
        setJobCard(prev => prev ? { ...prev, checklist_status: 'NOT_APPLICABLE' } as any : prev);
        setChecklistStatusResolved(true);
      })();
      return;
    }

    // Feature flag is on — check template applicability
    (async () => {
      try {
        const template = await resolveChecklistTemplate(
          jobCard.vehicle?.model || null,
          jobCard.workshop_id,
          workshopCountry
        );
        const status = template ? 'PENDING' : 'NOT_APPLICABLE';
        await supabase.from('job_cards').update({ checklist_status: status } as any).eq('id', id);
        setJobCard(prev => prev ? { ...prev, checklist_status: status } as any : prev);
      } catch (err) {
        console.error('Failed to resolve checklist status:', err);
      } finally {
        setChecklistStatusResolved(true);
      }
    })();
  }, [id, jobCard?.id, jobCard?.status, checklistEnabledForThisJC, checklistFlagLoading, checklistStatusResolved]);

  const fetchJobCard = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase.
      from('job_cards').
      select(`
          *,
          vehicle:vehicles(*),
          creator:profiles!job_cards_created_by_fkey(full_name, email, phone),
          workshop:workshops(id, name, country)
        `).
      eq('id', id).
      single();

      if (error) throw error;

      setJobCard({
        ...data,
        status: data.status as JobCardStatus
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
      const { data, error } = await supabase.
      from('audit_trail').
      select(`
          *,
          user:profiles!audit_trail_user_id_fkey(full_name)
        `).
      eq('job_card_id', id).
      order('created_at', { ascending: false });

      if (error) throw error;

      setAuditTrail((data || []).map((item) => ({
        ...item,
        from_status: item.from_status as JobCardStatus | null,
        to_status: item.to_status as JobCardStatus
      })) as AuditTrailEntry[]);
    } catch (error) {
      console.error('Error fetching audit trail:', error);
    }
  };

  const updateStatus = async (newStatus: JobCardStatus, additionalData?: Record<string, any>, auditNotes?: string) => {
    if (!jobCard || !profile) return;

    setIsUpdating(true);
    try {
      const additionalPayload: Record<string, any> = {};
      if (additionalData?.inwarding_otp_verified !== undefined) additionalPayload.inwarding_otp_verified = additionalData.inwarding_otp_verified;
      if (additionalData?.delivery_otp_verified !== undefined) additionalPayload.delivery_otp_verified = additionalData.delivery_otp_verified;
      if (additionalData?.completion_remarks !== undefined) additionalPayload.completion_remarks = additionalData.completion_remarks;
      if (additionalData?.service_categories) additionalPayload.service_categories = additionalData.service_categories;
      if (additionalData?.issue_categories) additionalPayload.issue_categories = additionalData.issue_categories;
      if (additionalData?.assigned_mechanic_name !== undefined) additionalPayload.assigned_mechanic_name = additionalData.assigned_mechanic_name;

      const { data, error } = await supabase.rpc('transition_job_card_status', {
        p_job_card_id: jobCard.id,
        p_new_status: newStatus,
        p_notes: auditNotes || null,
        p_additional_data: Object.keys(additionalPayload).length > 0 ? additionalPayload : null
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('CHECKLIST_REQUIRED')) {
          toast.error('Please complete the vehicle checklist before starting work.');
        } else if (msg.includes('INVALID_TRANSITION')) {
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
      // Refresh both in parallel
      Promise.all([fetchJobCard(), fetchAuditTrail()]);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update job card');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartWork = () => {
    if (!jobCard || !canTransitionTo(jobCard.status, 'IN_PROGRESS')) return;

    const clStatus = (jobCard as any).checklist_status;
    // Gate 1: Checklist must be completed if required
    if (clStatus === 'PENDING') {
      toast.error('Please complete the vehicle checklist before starting work.');
      setShowChecklist(true);
      return;
    }

    // Gate 2: Mechanic name capture if enabled
    if (mechanicNameEnabledForThisJC) {
      setMechanicSheetForStartWork(true);
      setShowMechanicSheet(true);
      return;
    }

    // No gates — proceed directly
    updateStatus('IN_PROGRESS');
  };

  const handleChecklistCompleted = () => {
    // Update local job card state with COMPLETED status
    setJobCard(prev => prev ? { ...prev, checklist_status: 'COMPLETED' } as any : prev);
    // Do NOT auto-start work. User must tap Start Work manually.
  };

  const handleMechanicNameSave = async (name: string) => {
    if (!jobCard || !profile) return;
    setIsSavingMechanic(true);
    try {
      const oldName = (jobCard as any).assigned_mechanic_name || null;

      // Run update + audit insert concurrently
      const [updateResult] = await Promise.all([
        supabase
          .from('job_cards')
          .update({ assigned_mechanic_name: name } as any)
          .eq('id', jobCard.id),
        supabase.from('audit_trail').insert({
          job_card_id: jobCard.id,
          user_id: profile.id,
          from_status: jobCard.status,
          to_status: jobCard.status,
          notes: JSON.stringify({
            event: 'MECHANIC_NAME_UPDATED',
            old_mechanic_name: oldName,
            new_mechanic_name: name,
            status_at_change: jobCard.status
          })
        }),
      ]);
      if (updateResult.error) throw updateResult.error;

      setShowMechanicSheet(false);

      if (mechanicSheetForStartWork) {
        setMechanicSheetForStartWork(false);
        await updateStatus('IN_PROGRESS', { assigned_mechanic_name: name });
      } else {
        toast.success('Mechanic name updated');
        Promise.all([fetchJobCard(), fetchAuditTrail()]);
      }
    } catch (err: any) {
      console.error('Error saving mechanic name:', err);
      toast.error(err?.message || 'Failed to save mechanic name');
    } finally {
      setIsSavingMechanic(false);
    }
  };

  const handleSparesModalSaved = () => {
    refetchSpares();
  };

  const handleEditSpare = (spare: JobCardSpare) => {
    if (spare.approval_state !== 'DRAFT') {
      toast.error('Claim submitted. Withdraw to make changes.');
      return;
    }
    setEditingSpare(spare);
    setShowSparesModal(true);
  };

  const handleDeleteSpare = async () => {
    if (!deletingSpareId) return;
    const spare = spares.find((s) => s.id === deletingSpareId);
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
    if (!jobCard) return;
    if (!canTransitionTo(jobCard.status, 'READY')) {
      if (jobCard.status === 'REOPENED') {
        toast.error('Start work again before completing a reopened job card.');
      }
      return;
    }

    // Close dialog immediately for perceived speed
    setShowCompleteWork(false);

    // Append closure remarks as a work note with type qualifier
    const existing = (jobCard as any).mechanic_notes as string | null;
    const timestamp = format(new Date(), 'dd MMM HH:mm');
    const entry = `[${timestamp}] 🔒 Work completed — ${remarks}`;
    const updatedNotes = existing ? `${existing}\n${entry}` : entry;

    // Run notes update + status transition concurrently
    const [notesResult] = await Promise.all([
      supabase
        .from('job_cards')
        .update({ mechanic_notes: updatedNotes } as any)
        .eq('id', jobCard.id),
      updateStatus('READY'),
    ]);

    if (notesResult.error) {
      console.error('Failed to save work note:', notesResult.error);
    }

    // Fire SMS in background — don't block UI
    sendSms({ jobCardId: jobCard.id, trigger: 'READY' }).catch(console.error);
  };

  const handleInwardingVerified = () => {
    if (jobCard) {
      updateStatus('INWARDED', { inwarding_otp_verified: true });
      sendSms({ jobCardId: jobCard.id, trigger: 'INWARDED' });
    }
    setShowInwardingOtp(false);
  };

  const handleInwardingAction = () => {
    if (!jobCard) return;
    if (profile?.role === 'super_admin') {
      updateStatus('INWARDED', { inwarding_otp_verified: true }, 'Super admin bypass – OTP skipped');
      sendSms({ jobCardId: jobCard.id, trigger: 'INWARDED' });
    } else {
      setShowInwardingOtp(true);
    }
  };

  const handleDeliveryVerified = async () => {
    if (jobCard && pendingOutSocData) {
      setIsUpdating(true);
      try {
        const outSocUrl = await uploadJcImage(pendingOutSocData.file, jobCard.id, 'outgoing_soc');
        // Run SOC data save + status transition concurrently
        await Promise.all([
          supabase
            .from('job_cards')
            .update({
              out_soc_value: pendingOutSocData.value,
              out_soc_photo_url: outSocUrl,
              out_soc_detected_value: pendingOutSocData.validation?.ocr?.socReading ?? null,
              out_soc_detection_confidence: pendingOutSocData.validation?.ocr?.confidence ?? null,
              out_soc_override_reason: pendingOutSocData.mismatchConfirmed ? pendingOutSocData.mismatchReason : null,
              out_soc_override_comment: pendingOutSocData.mismatchConfirmed ? pendingOutSocData.mismatchComment : null,
              out_soc_anomaly_flag: false
            } as any)
            .eq('id', jobCard.id),
          updateStatus('DELIVERED', { delivery_otp_verified: true }),
        ]);

        // Fire SMS in background
        sendSms({ jobCardId: jobCard.id, trigger: 'DELIVERED' })
          .then(result => {
            if (result?.auto_completed) {
              Promise.all([fetchJobCard(), fetchAuditTrail()]);
            }
          })
          .catch(console.error);
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

  const handleDeliveryAction = () => {
    setShowDeliveryConfirm(true);
  };

  const handleOutgoingSocProceed = (socData: OutgoingSocData) => {
    setPendingOutSocData(socData);
    setShowDeliveryConfirm(false);
    if (profile?.role === 'super_admin') {
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
      await supabase.
      from('job_cards').
      update({
        out_soc_value: socData.value,
        out_soc_photo_url: outSocUrl,
        out_soc_detected_value: socData.validation?.ocr?.socReading ?? null,
        out_soc_detection_confidence: socData.validation?.ocr?.confidence ?? null,
        out_soc_override_reason: socData.mismatchConfirmed ? socData.mismatchReason : null,
        out_soc_override_comment: socData.mismatchConfirmed ? socData.mismatchComment : null,
        out_soc_anomaly_flag: false
      } as any).
      eq('id', jobCard.id);

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

  const handleReopenJobCard = async (serviceCategories: string[], issueCategories: string[], comments: string) => {
    if (jobCard && canTransitionTo(jobCard.status, 'REOPENED')) {
      // Append reopen remarks as a work note with type qualifier
      if (comments) {
        const existing = (jobCard as any).mechanic_notes as string | null;
        const timestamp = format(new Date(), 'dd MMM HH:mm');
        const entry = `[${timestamp}] 🔄 Job reopened — ${comments}`;
        const updatedNotes = existing ? `${existing}\n${entry}` : entry;

        await supabase
          .from('job_cards')
          .update({ mechanic_notes: updatedNotes } as any)
          .eq('id', jobCard.id);
      }

      updateStatus('REOPENED', {
        service_categories: [...jobCard.service_categories, ...serviceCategories],
        issue_categories: [...jobCard.issue_categories, ...issueCategories]
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
      </AppLayout>);

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
      </AppLayout>);

  }

  const vehicle = jobCard.vehicle;

  // Checklist status — used only for CTA gating
  const persistedChecklistStatus = (jobCard as any).checklist_status as string | null;

  // Determine if sticky CTA needs checklist gate for INWARDED
  const inwardedNeedsChecklist = jobCard.status === 'INWARDED' && persistedChecklistStatus === 'PENDING';
  const checklistStillLoading = !persistedChecklistStatus && !checklistStatusResolved;

  // Determine sticky CTA content
  const renderStickyCta = () => {
    const status = jobCard.status;

    if (status === 'DRAFT' && can('jc.inward_vehicle')) {
      return (
        <Button
          className="w-full h-12 text-sm font-semibold"
          onClick={handleInwardingAction}
          disabled={isUpdating}>
          {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Complete Inwarding
        </Button>);
    }

    if (status === 'INWARDED' && can('jc.start_work')) {
      if (checklistStillLoading) {
        return (
          <Button className="w-full h-12 text-sm font-semibold" disabled>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Checking…
          </Button>);
      }
      if (inwardedNeedsChecklist && can('jc.complete_checklist')) {
        return (
          <Button
            className="w-full h-12 text-sm font-semibold"
            onClick={() => setShowChecklist(true)}
            disabled={isUpdating}>
            Complete Inward Checklist
          </Button>);
      }
      if (!inwardedNeedsChecklist) {
        return (
          <Button
            className="w-full h-12 text-sm font-semibold"
            onClick={handleStartWork}
            disabled={isUpdating}>
            {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Start Work
          </Button>);
      }
    }

    if (status === 'IN_PROGRESS') {
      const sparesBlocking = sparesEnabled && mandatorySparesRequired && spares.length === 0;
      const canAddSpares = can('spares.add');
      const canComplete = can('jc.mark_completed');

      if (canComplete) {
        if (sparesBlocking && !canAddSpares) {
          // Technician can't add spares — show disabled CTA with guidance
          return (
            <Button
              className="w-full h-12 text-sm font-semibold"
              disabled
              variant="default">
              <AlertCircle className="h-4 w-4 mr-2" />
              Spares Required — Contact Spares Manager
            </Button>);
        }
        return (
          <Button
            className="w-full h-12 text-sm font-semibold"
            onClick={() => {
              if (sparesBlocking && canAddSpares) {
                setEditingSpare(null);
                setShowSparesModal(true);
                return;
              }
              setShowCompleteWork(true);
            }}
            disabled={isUpdating}
            variant="default">
            {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {sparesBlocking ? 'Add Required Spares' : 'Mark Work Completed'}
          </Button>);
      }

      // User can't complete work but CAN add spares — show Add Spare CTA
      if (canAddSpares) {
        return (
          <Button
            className="w-full h-12 text-sm font-semibold"
            onClick={() => { setEditingSpare(null); setShowSparesModal(true); }}
            disabled={isUpdating}
            variant="default">
            + Add Spare
          </Button>);
      }
    }

    if (status === 'REOPENED' && can('jc.start_work')) {
      return (
        <Button
          className="w-full h-12 text-sm font-semibold"
          onClick={handleStartWork}
          disabled={isUpdating}>
          {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Start Work
        </Button>);
    }

    if (status === 'READY') {
      const canReopen = can('jc.reopen');
      const canDeliver = can('jc.deliver');
      if (!canReopen && !canDeliver) return null;
      return (
        <div className="flex gap-3">
          {canReopen && (
            <Button
              variant="outline"
              className="flex-1 h-12 text-sm font-semibold"
              onClick={() => setShowReopenDialog(true)}
              disabled={isUpdating}>
              Reopen
            </Button>
          )}
          {canDeliver && (
            <Button
              className="flex-1 h-12 text-sm font-semibold"
              onClick={handleDeliveryAction}
              disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Deliver Vehicle
            </Button>
          )}
        </div>);
    }

    // DELIVERED / COMPLETED / CLOSED → no CTA
    return null;
  };

  const stickyCta = renderStickyCta();
  const hasStickyCta = stickyCta !== null;

  return (
    <AppLayout>
      {/* Header: JC number centered, status pill on right */}
      <PageHeader
        title={jobCard.jc_number}
        showBack
        rightAction={<StatusPill status={jobCard.status} size="sm" />} />
      
      
      <div className={`p-4 space-y-4 ${hasStickyCta ? 'pb-24' : ''}`}>

        {/* Status context — neutral inline alerts */}
        {jobCard.status === 'DRAFT' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2 px-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Complete inwarding
          </p>
        )}
        {jobCard.status === 'DELIVERED' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            Vehicle delivered
          </p>
        )}
        {jobCard.status === 'REOPENED' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2 px-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Reopened — work resumed
          </p>
        )}
        {(jobCard.status === 'COMPLETED' || jobCard.status === 'CLOSED') && (
          <p className="text-sm text-muted-foreground flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {jobCard.status === 'COMPLETED' ? 'Completed' : 'Closed'}
          </p>
        )}

        {/* 1. Vehicle Details */}
        <VehicleDetailsCard vehicle={vehicle} jobCard={jobCard} isExpanded={expandedSection === 'vehicle'} onToggle={() => toggleSection('vehicle')} />

        {/* 2. Service Details */}
          <ServiceDetailsSection
          serviceCategories={jobCard.service_categories}
          issueCategories={jobCard.issue_categories}
          resolveCategoryName={resolveCategoryName}
          getParentCode={getParentCode}
          canEditIssues={canEditIssues}
          onEditIssues={() => setShowEditIssues(true)}
          customerComments={(jobCard as any).customer_comments}
          
          isExpanded={expandedSection === 'service'}
          onToggle={() => toggleSection('service')}
        />

        {/* 3. Work Execution — only after work has started */}
        {(jobCard.work_started_at || jobCard.status === 'IN_PROGRESS' || jobCard.status === 'REOPENED' || jobCard.status === 'READY' || jobCard.status === 'DELIVERED' || jobCard.status === 'COMPLETED' || jobCard.status === 'CLOSED') && (
          <WorkExecutionSection
            assignedMechanicName={mechanicNameEnabledForThisJC ? (jobCard as any).assigned_mechanic_name : null}
            mechanicNotes={(jobCard as any).mechanic_notes}
            canAddNote={canAddMechanicNote}
            onAddNote={handleAddMechanicNote}
            isExpanded={expandedSection === 'execution'}
            onToggle={() => toggleSection('execution')}
            labourEnabled={labourActive && can('labour.view')}
            labourEntries={labourEntries}
            labourLoading={labourLoading}
            canAddLabour={labourActive && canEditLabourInJc && can('labour.add')}
            canEditLabour={labourActive && canEditLabourInJc && can('labour.edit')}
            canRemoveLabour={labourActive && canEditLabourInJc && can('labour.remove')}
            onAddLabour={() => { setEditingLabour(null); setShowLabourSheet(true); }}
            onEditLabour={(entry) => { setEditingLabour(entry); setShowLabourSheet(true); }}
            onRemoveLabour={(id) => setDeletingLabourId(id)}
          />
        )}

        {/* 4. Spares Used Section */}
        {sparesEnabled && can('spares.view') &&
        <SparesUsedSection
          spares={spares}
          isLoading={sparesLoading}
          onAddSpares={can('spares.add') ? () => {setEditingSpare(null);setShowSparesModal(true);} : undefined}
          onEditSpare={can('spares.edit') ? handleEditSpare : undefined}
          onDeleteSpare={can('spares.remove') ? (id) => setDeletingSpareId(id) : undefined}
          onSubmitWarranty={warrantyEnabled && can('spares.submit_warranty') ? (spare) => setWarrantySpare(spare) : undefined}
          onWithdrawSpare={(spare) => setWithdrawingSpare(spare)}
          onRespondNeedsInfo={(spare) => setNeedsInfoSpare(spare)}
          onConvertToUserPaid={warrantyEnabled ? handleConvertToUserPaid : undefined}
          onSubmitAll={warrantyEnabled && can('spares.submit_warranty') ? () => setShowSubmitAll(true) : undefined}
          canEdit={(jobCard.status === 'IN_PROGRESS' || jobCard.status === 'REOPENED') && can('spares.edit')}
          warrantyEnabled={warrantyEnabled}
          mandatorySparesRequired={mandatorySparesRequired}
          jobCardStatus={jobCard.status}
          isExpanded={expandedSection === 'spares'}
          onToggle={() => toggleSection('spares')}
        />
        }

        {/* 5. Timeline */}
        <Card>
          <CardHeader className={expandedSection === 'timeline' ? "pb-0" : ""}>
            <button
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => toggleSection('timeline')}
            >
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Timeline
                </CardTitle>
                {expandedSection !== 'timeline' && (
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {auditTrail.length} status change{auditTrail.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
                {expandedSection === 'timeline' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
          </CardHeader>
          {expandedSection === 'timeline' &&
          <CardContent className="pt-4">
              <div className="flex flex-col">
                {auditTrail.map((entry, i) =>
              <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <div className="w-px flex-1 bg-border min-h-[16px]" />
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2">
                        <StatusPill status={entry.to_status} size="sm" />
                        {entry.from_status &&
                    <span className="text-xs text-muted-foreground">
                            from {STATUS_CONFIG[entry.from_status].label}
                          </span>
                    }
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(entry.user as any)?.full_name || 'System'} • {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                      </p>
                      {entry.notes &&
                  <p className="text-sm mt-1">{entry.notes}</p>
                  }
                    </div>
                  </div>
              )}
                
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${jobCard.status !== 'DRAFT' ? 'bg-primary' : 'bg-muted'}`}>
                      <CheckCircle2 className={`h-3 w-3 ${jobCard.status !== 'DRAFT' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
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
          }
        </Card>
      </div>

      {/* Sticky CTA bar — above bottom navigation */}
      {hasStickyCta &&
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border px-4 shadow-[0_-2px_10px_-3px_hsl(var(--foreground)/0.08)] my-0 py-[6px]">
          <div className="mx-auto max-w-lg">
            {stickyCta}
          </div>
        </div>
      }

      {/* Dialogs */}
      <OtpVerificationDialog
        open={showInwardingOtp}
        onOpenChange={setShowInwardingOtp}
        jobCard={jobCard}
        purpose="inwarding"
        onVerified={handleInwardingVerified}
        country={workshopCountry} />
      

      <OtpVerificationDialog
        open={showDeliveryOtp}
        onOpenChange={setShowDeliveryOtp}
        jobCard={jobCard}
        purpose="delivery"
        onVerified={handleDeliveryVerified}
        country={workshopCountry} />
      

      <CompleteWorkDialog
        open={showCompleteWork}
        onOpenChange={setShowCompleteWork}
        jobCard={jobCard}
        onComplete={handleCompleteWork}
        sparesEnabled={sparesEnabled}
        spares={spares}
        warrantyEnabled={warrantyEnabled}
        canAddSpares={can('spares.add')}
        onOpenSparesModal={() => setShowSparesModal(true)} />
      

      <ReopenJobCardDialog
        open={showReopenDialog}
        onOpenChange={setShowReopenDialog}
        onReopen={handleReopenJobCard} />
      

      {jobCard &&
      <EditIssuesSheet
        open={showEditIssues}
        onOpenChange={setShowEditIssues}
        currentServiceCategories={jobCard.service_categories}
        currentIssueCategories={jobCard.issue_categories}
        onSave={handleSaveIssues}
        isSaving={isSavingIssues}
        mechanicName={(jobCard as any).assigned_mechanic_name}
        showMechanicField={canEditMechanic}
        />

      }

      <DeliveryWithSocDialog
        open={showDeliveryConfirm}
        onOpenChange={setShowDeliveryConfirm}
        onProceed={handleOutgoingSocProceed}
        country={workshopCountry} />
      

      {jobCard && sparesEnabled &&
      <SparesModal
        open={showSparesModal}
        onOpenChange={(open) => {
          setShowSparesModal(open);
          if (!open) {
            setEditingSpare(null);
          }
        }}
        jobCardId={jobCard.id}
        profileId={profile?.id || ''}
        vehicleModel={jobCard.vehicle?.model}
        vehicleColorCode={(jobCard.vehicle as any)?.color_code}
        warrantyEnabled={warrantyEnabled}
        onSaved={handleSparesModalSaved}
        editingSpare={editingSpare} />

      }

      {warrantySpare &&
      <SubmitWarrantySheet
        open={!!warrantySpare}
        onOpenChange={(open) => {if (!open) setWarrantySpare(null);}}
        spare={warrantySpare}
        jobCardId={jobCard.id}
        profileId={profile?.id || ''}
        jobCard={jobCard}
        onSubmitted={() => {setWarrantySpare(null);refetchSpares();}} />

      }

      {warrantyEnabled &&
      <SubmitAllWarrantySheet
        open={showSubmitAll}
        onOpenChange={setShowSubmitAll}
        spares={spares}
        jobCardId={jobCard.id}
        profileId={profile?.id || ''}
        onSubmitted={() => {setShowSubmitAll(false);refetchSpares();}} />

      }

      <ConfirmationDialog
        open={!!deletingSpareId}
        onOpenChange={(open) => {if (!open) setDeletingSpareId(null);}}
        title="Delete Spare"
        description="Are you sure you want to remove this spare part? This action cannot be undone."
        onConfirm={handleDeleteSpare}
        confirmLabel="Delete"
        variant="destructive" />
      

      <ConfirmationDialog
        open={!!withdrawingSpare}
        onOpenChange={(open) => {if (!open) setWithdrawingSpare(null);}}
        title="Withdraw submission?"
        description="This claim is already submitted. Withdrawing will reset the submission so you can edit the part/qty/type. Old-part evidence photos and serial will be cleared. Continue?"
        onConfirm={handleWithdrawSpare}
        confirmLabel="Withdraw"
        variant="destructive" />
      

      {needsInfoSpare && profile &&
      <NeedsInfoResponseSheet
        open={!!needsInfoSpare}
        onOpenChange={(open) => {if (!open) setNeedsInfoSpare(null);}}
        spare={needsInfoSpare}
        jobCardId={jobCard.id}
        profileId={profile.id}
        userId={profile.user_id}
        onResponded={() => {setNeedsInfoSpare(null);refetchSpares();}} />

      }

      {/* Vehicle Checklist Sheet */}
      {checklistEnabledForThisJC &&
      <VehicleChecklistSheet
        open={showChecklist}
        onOpenChange={setShowChecklist}
        jobCardId={jobCard.id}
        vehicleModel={jobCard.vehicle?.model || null}
        workshopId={jobCard.workshop_id}
        workshopCountry={workshopCountry}
        onCompleted={handleChecklistCompleted} />

      }

      {/* Mechanic Name Sheet */}
      <MechanicNameSheet
        open={showMechanicSheet}
        onOpenChange={(open) => {
          setShowMechanicSheet(open);
          if (!open) setMechanicSheetForStartWork(false);
        }}
        currentName={(jobCard as any).assigned_mechanic_name || null}
        onSave={handleMechanicNameSave}
        isSaving={isSavingMechanic} />
      
      {/* Labour Sheet */}
      {labourActive && (
        <AddLabourSheet
          open={showLabourSheet}
          onOpenChange={(open) => {
            setShowLabourSheet(open);
            if (!open) setEditingLabour(null);
          }}
          catalogue={labourCatalogue}
          editingEntry={editingLabour}
          onSave={handleSaveLabour}
          isSaving={isSavingLabour}
        />
      )}

      {/* Labour Delete Confirmation */}
      <ConfirmationDialog
        open={!!deletingLabourId}
        onOpenChange={(open) => { if (!open) setDeletingLabourId(null); }}
        title="Remove Labour"
        description="Are you sure you want to remove this labour entry? This action cannot be undone."
        onConfirm={handleDeleteLabour}
        confirmLabel="Remove"
        variant="destructive"
      />

    </AppLayout>);

}