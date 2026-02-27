import { useState, useMemo } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { JobCardSpare, SparePhotoKind } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';

interface SubmitWarrantySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spare: JobCardSpare;
  jobCardId: string;
  profileId: string;
  onSubmitted: () => void;
}

const CLAIM_LABEL: Record<string, string> = {
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
};

export function SubmitWarrantySheet({
  open, onOpenChange, spare, jobCardId, profileId, onSubmitted,
}: SubmitWarrantySheetProps) {
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const part = spare.spare_part;
  const isWarranty = spare.claim_type === 'WARRANTY';
  const reqCount = part
    ? (isWarranty ? part.warranty_old_part_photos_required_count : part.goodwill_old_part_photos_required_count)
    : 0;
  const prompts: string[] = part
    ? (isWarranty
        ? (Array.isArray(part.warranty_old_part_photo_prompts) ? part.warranty_old_part_photo_prompts as string[] : [])
        : (Array.isArray(part.goodwill_old_part_photo_prompts) ? part.goodwill_old_part_photo_prompts as string[] : []))
    : [];

  const existingOldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE');
  const existingProofPhotos = (spare.photos || []).filter(p => p.photo_kind === 'NEW_PART_PROOF');

  const totalOld = existingOldPhotos.length + newPhotos.length;
  const isReady = reqCount <= 0 || totalOld >= reqCount;

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPhotos(prev => [...prev, file]);
    }
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!isReady) return;
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

      // Update approval_state to SUBMITTED
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('job_card_spares' as any)
        .update({
          approval_state: 'SUBMITTED',
          submitted_at: now,
          last_submitted_at: now,
        } as any)
        .eq('id', spare.id);

      if (error) throw error;

      toast.success(`${CLAIM_LABEL[spare.claim_type]} claim submitted`);
      setNewPhotos([]);
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
          {/* Spare summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">Qty: {spare.qty}</Badge>
            <Badge variant="default" className="text-xs">{CLAIM_LABEL[spare.claim_type]}</Badge>
            {spare.serial_number && (
              <Badge variant="secondary" className="text-xs">S/N: {spare.serial_number}</Badge>
            )}
          </div>

          {/* Existing NEW_PART_PROOF thumbnails */}
          {existingProofPhotos.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                New Part Proof ({existingProofPhotos.length})
              </Label>
              <div className="flex gap-2 flex-wrap">
                {existingProofPhotos.map(photo => (
                  <div key={photo.id} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                    <img src={photo.photo_url} alt="Proof" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OLD_PART_EVIDENCE upload slots */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Old Part Evidence
              <span className={`text-xs font-normal ${isReady ? 'text-green-600' : 'text-destructive'}`}>
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
                <p className="text-xs text-muted-foreground">Photo {prompts.length + i + 1}</p>
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

          {!isReady && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Upload all required old-part evidence photos to submit.
            </div>
          )}
        </div>

        <DrawerFooter>
          <Button onClick={handleSubmit} disabled={!isReady || submitting}>
            {submitting ? 'Submitting...' : `Submit ${CLAIM_LABEL[spare.claim_type]}`}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
