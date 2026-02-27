import { useState, useMemo } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, AlertCircle, Send, Car, Gauge } from 'lucide-react';
import { JobCardSpare, SparePhotoKind, Vehicle, JobCard } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

interface SubmitWarrantySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spare: JobCardSpare;
  jobCardId: string;
  profileId: string;
  jobCard: JobCard;
  onSubmitted: () => void;
}

const CLAIM_LABEL: Record<string, string> = {
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
};

export function SubmitWarrantySheet({
  open, onOpenChange, spare, jobCardId, profileId, jobCard, onSubmitted,
}: SubmitWarrantySheetProps) {
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [oldPartSerial, setOldPartSerial] = useState('');
  const [claimComment, setClaimComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const part = spare.spare_part;
  const isWarranty = spare.claim_type === 'WARRANTY';

  // Required old-part photo count
  const reqCount = part
    ? (isWarranty ? part.warranty_old_part_photos_required_count : part.goodwill_old_part_photos_required_count)
    : 0;

  // Photo prompts
  const prompts: string[] = part
    ? (isWarranty
        ? (Array.isArray(part.warranty_old_part_photo_prompts) ? part.warranty_old_part_photo_prompts as string[] : [])
        : (Array.isArray(part.goodwill_old_part_photo_prompts) ? part.goodwill_old_part_photo_prompts as string[] : []))
    : [];

  const existingOldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE');
  const totalOld = existingOldPhotos.length + newPhotos.length;

  // Config flags
  const needsOldPhotos = reqCount > 0;
  const needsOldSerial = part?.old_part_srno_required ?? false;

  // Validation
  const photosReady = !needsOldPhotos || totalOld >= reqCount;
  const serialReady = !needsOldSerial || oldPartSerial.trim().length > 0;
  const isReady = photosReady && serialReady;

  // Vehicle info
  const vehicle = jobCard.vehicle;
  const vehicleColor = vehicle?.color || null;
  const odometerPhotoUrl = jobCard.odometer_photo_url;

  // Validation messages
  const validationMessages = useMemo(() => {
    const msgs: string[] = [];
    if (needsOldPhotos && !photosReady) {
      const remaining = reqCount - totalOld;
      msgs.push(`Upload ${remaining} old-part photo${remaining > 1 ? 's' : ''} to continue`);
    }
    if (needsOldSerial && !serialReady) {
      msgs.push('Enter old part serial number to continue');
    }
    return msgs;
  }, [needsOldPhotos, photosReady, reqCount, totalOld, needsOldSerial, serialReady]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPhotos(prev => [...prev, file]);
    }
    e.target.value = '';
  };

  const handleSubmitClick = () => {
    if (!isReady) return;
    setShowConfirm(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      // Upload new old-part photos
      for (let i = 0; i < newPhotos.length; i++) {
        const file = newPhotos[i];
        const fileId = crypto.randomUUID();
        const path = `job_cards/${jobCardId}/spares/${spare.id}/OLD_PART_EVIDENCE/${fileId}.jpg`;

        let compressed: File;
        try {
          compressed = await compressImage(file);
        } catch {
          compressed = file;
        }

        const { error: uploadErr } = await supabase.storage
          .from('spare-photos')
          .upload(path, compressed);
        if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

        const promptText = prompts[existingOldPhotos.length + i] || null;
        await supabase
          .from('job_card_spare_photos' as any)
          .insert({
            job_card_spare_id: spare.id,
            photo_url: path,
            photo_kind: 'OLD_PART_EVIDENCE' as SparePhotoKind,
            uploaded_by: profileId,
            is_required: true,
            slot_index: existingOldPhotos.length + i + 1,
            prompt: promptText,
          } as any);
      }

      // Determine if auto-approve (no approval needed for this claim type)
      const needsApproval = spare.claim_type === 'WARRANTY'
        ? part?.warranty_approval_needed ?? true
        : part?.goodwill_approval_needed ?? true;

      const now = new Date().toISOString();
      const finalState = needsApproval ? 'SUBMITTED' : 'APPROVED';

      // Update spare with approval_state, serial, comment
      const updatePayload: any = {
        approval_state: finalState,
        submitted_at: now,
        last_submitted_at: now,
        old_part_serial_number: oldPartSerial.trim() || null,
        claim_comment: claimComment.trim() || null,
        submitted_by: null as string | null,
      };
      if (!needsApproval) {
        updatePayload.decided_at = now;
      }

      // Set submitted_by to current user
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        updatePayload.submitted_by = userData.user.id;
      }

      const { error } = await supabase
        .from('job_card_spares' as any)
        .update(updatePayload)
        .eq('id', spare.id);

      if (error) throw error;

      // Look up denormalized fields for action logging
      let workshopId: string | null = null;
      const { data: jcRow } = await supabase
        .from('job_cards')
        .select('workshop_id')
        .eq('id', jobCardId)
        .maybeSingle();
      workshopId = jcRow?.workshop_id || null;

      // Log SUBMIT action
      if (userData?.user) {
        await supabase.from('job_card_spare_actions' as any).insert({
          job_card_spare_id: spare.id,
          job_card_id: jobCardId,
          workshop_id: workshopId,
          action_type: 'SUBMIT',
          comment: claimComment.trim() || null,
          actor_user_id: userData.user.id,
        } as any);

        // If auto-approved, also log APPROVE action
        if (!needsApproval) {
          await supabase.from('job_card_spare_actions' as any).insert({
            job_card_spare_id: spare.id,
            job_card_id: jobCardId,
            workshop_id: workshopId,
            action_type: 'APPROVE',
            comment: 'Auto-approved (no approval required)',
            actor_user_id: userData.user.id,
          } as any);
        }
      }

      toast.success(
        needsApproval
          ? `${CLAIM_LABEL[spare.claim_type]} claim submitted`
          : `${CLAIM_LABEL[spare.claim_type]} claim auto-approved`
      );
      setNewPhotos([]);
      setOldPartSerial('');
      setClaimComment('');
      onSubmitted();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Warranty submit error:', err);
      toast.error(err.message || 'Failed to submit');
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
              Submit {CLAIM_LABEL[spare.claim_type]} Claim
            </DrawerTitle>
            <DrawerDescription>
              {part?.part_name || 'Unknown Part'}{part?.part_code ? ` (${part.part_code})` : ''}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-4 space-y-4 overflow-y-auto">
            {/* 1. Bike Details */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Car className="h-3 w-3" /> Vehicle Details
              </Label>
              <div className="rounded-md border p-2.5 space-y-1 text-sm bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Reg No</span>
                  <span className="font-medium text-xs">{vehicle?.reg_no || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Model</span>
                  <span className="font-medium text-xs">{vehicle?.model || '—'}</span>
                </div>
                {vehicleColor && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Color</span>
                    <span className="font-medium text-xs">{vehicleColor}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Odometer */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Gauge className="h-3 w-3" /> Odometer
              </Label>
              <div className="rounded-md border p-2.5 bg-muted/30 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{jobCard.odometer?.toLocaleString() ?? '—'} km</p>
                </div>
                {odometerPhotoUrl ? (
                  <div className="w-12 h-12 rounded-md overflow-hidden border bg-muted shrink-0">
                    <img src={odometerPhotoUrl} alt="Odo" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Photo: N/A</span>
                )}
              </div>
            </div>

            {/* 3. Old Part Evidence photos — only if reqCount > 0 */}
            {needsOldPhotos && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  Old Part Evidence
                  <span className={`text-xs font-normal ${photosReady ? 'text-green-600' : 'text-destructive'}`}>
                    ({totalOld}/{reqCount} required)
                  </span>
                </Label>

                {/* Existing old-part photos */}
                {existingOldPhotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {existingOldPhotos.map(photo => (
                      <div key={photo.id} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                        <img src={photo.photo_url} alt="Old part" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ))}
                  </div>
                )}

                {/* New photos captured in this session */}
                {newPhotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {newPhotos.map((file, i) => (
                      <div key={i} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                        <img src={URL.createObjectURL(file)} alt="New" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Remaining upload slots */}
                {prompts.map((prompt, pi) => {
                  if (totalOld > pi) return null;
                  return (
                    <div key={pi} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{prompt} <span className="text-[10px]">(Camera only)</span></p>
                      <Input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="h-9"
                      />
                    </div>
                  );
                })}

                {/* Extra slots if prompts < reqCount */}
                {Array.from({ length: Math.max(0, reqCount - Math.max(prompts.length, totalOld)) }).map((_, i) => (
                  <div key={`extra-${i}`} className="space-y-1">
                    <p className="text-xs text-muted-foreground">Photo {prompts.length + i + 1} <span className="text-[10px]">(Camera only)</span></p>
                    <Input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 4. Old Part Serial Number — only if required */}
            {needsOldSerial && (
              <div className="space-y-1.5">
                <Label htmlFor="old-part-serial">Old Part Serial Number *</Label>
                <Input
                  id="old-part-serial"
                  placeholder="Enter old part serial number"
                  value={oldPartSerial}
                  onChange={(e) => setOldPartSerial(e.target.value)}
                />
              </div>
            )}

            {/* 5. Optional comment */}
            <div className="space-y-1.5">
              <Label htmlFor="claim-comment">Comments (optional)</Label>
              <Textarea
                id="claim-comment"
                placeholder="Add any notes about this claim..."
                value={claimComment}
                onChange={(e) => setClaimComment(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Validation messages */}
            {validationMessages.length > 0 && (
              <div className="space-y-1">
                {validationMessages.map((msg, i) => (
                  <div key={i} className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DrawerFooter>
            <Button onClick={handleSubmitClick} disabled={!isReady || submitting}>
              {submitting ? 'Submitting...' : `Submit ${CLAIM_LABEL[spare.claim_type]}`}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Confirmation dialog */}
      <ConfirmationDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Confirm submission"
        description="Are you sure you have reviewed all the details before submitting the warranty claim?"
        confirmLabel="Yes, Submit"
        cancelLabel="Cancel"
        isLoading={submitting}
        onConfirm={handleConfirmedSubmit}
      />
    </>
  );
}
