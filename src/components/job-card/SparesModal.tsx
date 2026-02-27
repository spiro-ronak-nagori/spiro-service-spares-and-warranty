import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, Trash2, Camera, Package } from 'lucide-react';
import { SparePart, ClaimType, JobCardSpare, JobCardSparePhoto } from '@/types';
import { useApplicableSpareParts } from '@/hooks/useSparesFlow';
import { SearchablePartSelect } from '@/components/job-card/SearchablePartSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';

interface SpareLineInput {
  spare_part_id: string;
  part: SparePart | null;
  qty: number;
  claim_type: ClaimType;
  serial_number: string;
  comment: string;
  newPhotos: File[];
  newPhotoKinds: string[];
  existingPhotos: JobCardSparePhoto[];
}

interface SparesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  profileId: string;
  vehicleModel: string | null | undefined;
  vehicleColorCode: string | null | undefined;
  warrantyEnabled: boolean;
  onSaved: () => void;
  editingSpare?: JobCardSpare | null;
}

const emptyLine = (): SpareLineInput => ({
  spare_part_id: '',
  part: null,
  qty: 1,
  claim_type: 'USER_PAID',
  serial_number: '',
  comment: '',
  newPhotos: [],
  newPhotoKinds: [],
  existingPhotos: [],
});

const editLineFromSpare = (spare: JobCardSpare): SpareLineInput => ({
  spare_part_id: spare.spare_part_id,
  part: spare.spare_part || null,
  qty: spare.qty,
  claim_type: spare.claim_type,
  serial_number: spare.serial_number || '',
  comment: spare.technician_comment || '',
  newPhotos: [],
  newPhotoKinds: [],
  existingPhotos: spare.photos || [],
});

export function SparesModal({
  open, onOpenChange, jobCardId, profileId,
  vehicleModel, vehicleColorCode, warrantyEnabled, onSaved,
  editingSpare,
}: SparesModalProps) {
  const { parts, isLoading: partsLoading, warnings } = useApplicableSpareParts(vehicleModel, vehicleColorCode);
  const [lines, setLines] = useState<SpareLineInput[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const isEditMode = !!editingSpare;

  // Reset state when modal opens/closes or editingSpare changes
  useEffect(() => {
    if (open) {
      if (editingSpare) {
        setLines([editLineFromSpare(editingSpare)]);
        setActiveLineIdx(0);
      } else {
        setLines([emptyLine()]);
        setActiveLineIdx(0);
      }
    }
  }, [open, editingSpare]);

  const updateLine = (idx: number, updates: Partial<SpareLineInput>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  };

  const selectPart = (idx: number, partId: string) => {
    const part = parts.find(p => p.id === partId) || null;
    const prevPartId = lines[idx].spare_part_id;

    // If part changed, clear old-part evidence (serial + photos) since they belong to the old part
    const partChanged = prevPartId && prevPartId !== partId;
    updateLine(idx, {
      spare_part_id: partId,
      part,
      claim_type: warrantyEnabled ? lines[idx].claim_type : 'USER_PAID',
      // Clear old-part data when part changes
      ...(partChanged ? {
        existingPhotos: lines[idx].existingPhotos.filter(p => p.photo_kind !== 'OLD_PART_EVIDENCE'),
      } : {}),
    });

    // If editing and part changed, delete OLD_PART_EVIDENCE photos from DB
    if (partChanged && editingSpare) {
      supabase
        .from('job_card_spare_photos' as any)
        .delete()
        .eq('job_card_spare_id', editingSpare.id)
        .eq('photo_kind', 'OLD_PART_EVIDENCE')
        .then(({ error }) => {
          if (error) console.error('Failed to clear old-part photos on part change:', error);
        });

      // Clear old_part_serial_number in DB
      supabase
        .from('job_card_spares' as any)
        .update({ old_part_serial_number: null } as any)
        .eq('id', editingSpare.id)
        .then(({ error }) => {
          if (error) console.error('Failed to clear old_part_serial_number on part change:', error);
        });
    }
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
    if (activeLineIdx >= lines.length - 1) setActiveLineIdx(Math.max(0, lines.length - 2));
  };

  const currentLine = lines[activeLineIdx];
  const currentPart = currentLine?.part;

  // Photo validation for current line — OLD_PART_EVIDENCE does NOT block saving
  const photoValidation = useMemo(() => {
    if (!currentLine || !currentPart) return { valid: true, message: '' };

    const existingProofCount = currentLine.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF').length;
    const newProofCount = currentLine.newPhotoKinds.filter(k => k === 'NEW_PART_PROOF').length;
    const totalProof = existingProofCount + newProofCount;
    const requiredProof = currentPart.usage_proof_photos_required_count;

    if (requiredProof > 0 && totalProof < requiredProof) {
      return { valid: false, message: `Upload ${totalProof}/${requiredProof} required proof photos to continue.` };
    }

    return { valid: true, message: '' };
  }, [currentLine, currentPart]);

  // Check all lines for save validity — only NEW_PART_PROOF + serial block save
  const allLinesValid = useMemo(() => {
    return lines.every(line => {
      if (!line.spare_part_id) return true;
      const part = line.part;
      if (!part) return true;

      // Serial number required check
      if (part.serial_required && !line.serial_number.trim()) return false;

      const existProof = line.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF').length;
      const newProof = line.newPhotoKinds.filter(k => k === 'NEW_PART_PROOF').length;
      if (part.usage_proof_photos_required_count > 0 && (existProof + newProof) < part.usage_proof_photos_required_count) return false;

      return true;
    });
  }, [lines]);

  const handleSave = async () => {
    const validLines = lines.filter(l => l.spare_part_id);
    if (validLines.length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      for (const line of validLines) {
        let spareId: string;

        if (isEditMode && editingSpare) {
          // UPDATE existing spare
          const { error } = await supabase
            .from('job_card_spares' as any)
            .update({
              spare_part_id: line.spare_part_id,
              qty: line.qty,
              claim_type: line.claim_type,
              serial_number: line.serial_number || null,
              technician_comment: line.comment || null,
              updated_by: profileId,
            } as any)
            .eq('id', editingSpare.id);
          if (error) throw error;
          spareId = editingSpare.id;
        } else {
          // Check for duplicate merge (same part + claim type)
          const { data: existing } = await supabase
            .from('job_card_spares' as any)
            .select('id, qty, serial_number')
            .eq('job_card_id', jobCardId)
            .eq('spare_part_id', line.spare_part_id)
            .eq('claim_type', line.claim_type);

          const existingRows = (existing || []) as any[];

          const shouldMerge = existingRows.length > 0 &&
            !(line.part?.serial_required && line.serial_number &&
              existingRows[0].serial_number !== line.serial_number);

          if (shouldMerge && existingRows.length > 0) {
            const row = existingRows[0];
            const { error } = await supabase
              .from('job_card_spares' as any)
              .update({
                qty: row.qty + line.qty,
                updated_by: profileId,
                technician_comment: line.comment || row.technician_comment,
              } as any)
              .eq('id', row.id);
            if (error) throw error;
            spareId = row.id;
          } else {
            const { data: inserted, error } = await supabase
              .from('job_card_spares' as any)
              .insert({
                job_card_id: jobCardId,
                spare_part_id: line.spare_part_id,
                qty: line.qty,
                claim_type: line.claim_type,
                serial_number: line.serial_number || null,
                technician_comment: line.comment || null,
                created_by: profileId,
              } as any)
              .select('id')
              .single();
            if (error) throw error;
            spareId = (inserted as any).id;
          }
        }

        // Upload new photos
        for (let pi = 0; pi < line.newPhotos.length; pi++) {
          const file = line.newPhotos[pi];
          const kind = line.newPhotoKinds[pi] || 'ADDITIONAL';
          const fileId = crypto.randomUUID();
          const path = `job_cards/${jobCardId}/spares/${spareId}/${kind}/${fileId}.jpg`;

          // Compress before upload
          let compressed: File;
          try {
            compressed = await compressImage(file);
          } catch {
            compressed = file;
          }

          const { error: uploadErr } = await supabase.storage
            .from('spare-photos')
            .upload(path, compressed);
          if (uploadErr) {
            console.error('Photo upload failed:', uploadErr);
            toast.error(`Photo upload failed: ${uploadErr.message}`);
            // Block save if mandatory photos can't upload
            throw new Error(`Photo upload unavailable. Please contact admin. (${uploadErr.message})`);
          }

          await supabase
            .from('job_card_spare_photos' as any)
            .insert({
              job_card_spare_id: spareId,
              photo_url: path,
              photo_kind: kind,
              uploaded_by: profileId,
            } as any);
        }
      }

      toast.success(isEditMode ? 'Spare updated' : `${validLines.length} spare(s) saved`);
      setLines([emptyLine()]);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to save spares:', err);
      toast.error(err.message || 'Failed to save spares');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoCapture = (idx: number, kind: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newPhotos = [...lines[idx].newPhotos, file];
      const newKinds = [...lines[idx].newPhotoKinds, kind];
      updateLine(idx, { newPhotos, newPhotoKinds: newKinds });
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isEditMode ? 'Edit Spare Part' : 'Add Spare Parts'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update this spare part record' : 'Record parts used for this job card'}
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Line tabs - only show for add mode with multiple lines */}
        {!isEditMode && (
          <div className="flex items-center gap-1 flex-wrap">
            {lines.map((l, i) => (
              <Badge
                key={i}
                variant={activeLineIdx === i ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setActiveLineIdx(i)}
              >
                {l.part?.part_name ? l.part.part_name.substring(0, 12) : `Part ${i + 1}`}
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {currentLine && (
          <div className="space-y-4">
            {/* Part selector */}
            <div className="space-y-2">
              <Label>Spare Part *</Label>
              <SearchablePartSelect
                parts={parts}
                value={currentLine.spare_part_id}
                onSelect={(val) => selectPart(activeLineIdx, val)}
                isLoading={partsLoading}
              />
            </div>

            {/* Qty + Claim Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={1}
                  max={currentPart?.max_qty_allowed || 50}
                  value={currentLine.qty}
                  onChange={(e) => updateLine(activeLineIdx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label>Claim Type</Label>
                {!warrantyEnabled ? (
                  <Input value="User Paid" disabled className="h-9" />
                ) : (
                  <Select
                    value={currentLine.claim_type}
                    onValueChange={(val) => updateLine(activeLineIdx, { claim_type: val as ClaimType })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER_PAID">User Paid</SelectItem>
                      {currentPart?.warranty_available && <SelectItem value="WARRANTY">Warranty</SelectItem>}
                      {currentPart?.goodwill_available && <SelectItem value="GOODWILL">Goodwill</SelectItem>}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Serial Number */}
            {currentPart?.serial_required && (
              <div className="space-y-1">
                <Label>Part Serial Number *</Label>
                <Input
                  value={currentLine.serial_number}
                  onChange={(e) => updateLine(activeLineIdx, { serial_number: e.target.value })}
                  placeholder="Enter part serial number"
                  className="h-9"
                />
              </div>
            )}

            {/* Comment */}
            <div className="space-y-1">
              <Label>Comment (optional)</Label>
              <Textarea
                value={currentLine.comment}
                onChange={(e) => updateLine(activeLineIdx, { comment: e.target.value })}
                placeholder="Notes about this part..."
                rows={2}
                className="resize-none"
              />
            </div>

            {/* NEW_PART_PROOF photos */}
            {currentPart && currentPart.usage_proof_photos_required_count > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  New Part Proof Photos ({currentPart.usage_proof_photos_required_count} required)
                </Label>
                {/* Existing photos */}
                {currentLine.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF').length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {currentLine.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF').map(photo => (
                      <div key={photo.id} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                        <img src={photo.photo_url} alt="Existing" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                {/* New photo capture slots */}
                {(() => {
                  const prompts = Array.isArray(currentPart.usage_proof_photo_prompts) ? currentPart.usage_proof_photo_prompts as string[] : [];
                  const requiredCount = currentPart.usage_proof_photos_required_count;
                  // Build slot labels: use prompts if available, otherwise generic labels
                  const slots = Array.from({ length: requiredCount }, (_, i) => prompts[i] || `Proof photo ${i + 1}`);
                  const existingCount = currentLine.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF').length;
                  const newCount = currentLine.newPhotoKinds.filter(k => k === 'NEW_PART_PROOF').length;
                  const filled = existingCount + newCount;
                  return slots.map((prompt, pi) => {
                    if (filled > pi) return null;
                    return (
                      <div key={pi} className="space-y-1">
                        <p className="text-xs text-muted-foreground">{prompt} <span className="text-[10px]">(Camera only)</span></p>
                        <Input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handlePhotoCapture(activeLineIdx, 'NEW_PART_PROOF', e)}
                          className="h-9"
                        />
                      </div>
                    );
                  });
                })()}
                {/* Show captured new photos as thumbnails */}
                {currentLine.newPhotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {currentLine.newPhotos.map((file, fi) => {
                      if (currentLine.newPhotoKinds[fi] !== 'NEW_PART_PROOF') return null;
                      return (
                        <div key={fi} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                          <img src={URL.createObjectURL(file)} alt="New" className="w-full h-full object-cover" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Note: Old-part evidence photos are captured via the Submit Warranty sheet */}
            {warrantyEnabled && currentPart && currentLine.claim_type !== 'USER_PAID' && (() => {
              const isWarranty = currentLine.claim_type === 'WARRANTY';
              const count = isWarranty
                ? currentPart.warranty_old_part_photos_required_count
                : currentPart.goodwill_old_part_photos_required_count;
              if (count <= 0) return null;
              return (
                <div className="flex items-center gap-2 text-xs bg-muted rounded-md p-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {count} old-part evidence photo{count > 1 ? 's' : ''} required — upload when submitting the {isWarranty ? 'warranty' : 'goodwill'} claim.
                  </span>
                </div>
              );
            })()}

            {/* Photo validation message */}
            {!photoValidation.valid && (
              <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {photoValidation.message}
              </div>
            )}

            {/* Remove line (add mode only) */}
            {!isEditMode && lines.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-8 text-xs"
                onClick={() => removeLine(activeLineIdx)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove this part
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEditMode ? 'Cancel' : 'Skip'}
          </Button>
          <Button onClick={handleSave} disabled={saving || !allLinesValid}>
            {saving ? 'Saving...' : isEditMode ? 'Update Spare' : 'Save Spares'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
