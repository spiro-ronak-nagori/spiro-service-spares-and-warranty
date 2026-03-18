import { useState, useEffect, useMemo } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, Trash2, Package } from 'lucide-react';
import { SparePart, ClaimType, JobCardSpare, JobCardSparePhoto } from '@/types';
import { useApplicableSpareParts } from '@/hooks/useSparesFlow';
import { SearchablePartSelect } from '@/components/job-card/SearchablePartSelect';
import { PhotoSlot } from '@/components/job-card/PhotoSlot';
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
  canApproveSpares?: boolean;
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
  editingSpare, canApproveSpares = false,
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

    const partChanged = prevPartId && prevPartId !== partId;
    updateLine(idx, {
      spare_part_id: partId,
      part,
      claim_type: warrantyEnabled ? lines[idx].claim_type : 'USER_PAID',
      ...(partChanged ? {
        existingPhotos: lines[idx].existingPhotos.filter(p => p.photo_kind !== 'OLD_PART_EVIDENCE'),
      } : {}),
    });

    if (partChanged && editingSpare) {
      supabase
        .from('job_card_spare_photos' as any)
        .delete()
        .eq('job_card_spare_id', editingSpare.id)
        .eq('photo_kind', 'OLD_PART_EVIDENCE')
        .then(({ error }) => {
          if (error) console.error('Failed to clear old-part photos on part change:', error);
        });

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

  const allLinesValid = useMemo(() => {
    return lines.every(line => {
      if (!line.spare_part_id) return true;
      const part = line.part;
      if (!part) return true;
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
          // --- Auto-generate edit diff if identity changed from last submission ---
          const lastPartId = (editingSpare as any).last_submitted_spare_part_id;
          const lastQty = (editingSpare as any).last_submitted_qty;
          const lastClaimType = (editingSpare as any).last_submitted_claim_type;
          const hasSnapshot = lastPartId || lastQty || lastClaimType;

          if (hasSnapshot) {
            const diffs: string[] = [];
            if (lastPartId && lastPartId !== line.spare_part_id) {
              const oldPartName = editingSpare.spare_part?.part_code || lastPartId;
              const newPartName = line.part?.part_code || line.spare_part_id;
              diffs.push(`part: ${oldPartName} → ${newPartName}`);
            }
            if (lastQty != null && lastQty !== line.qty) {
              diffs.push(`qty: ${lastQty} → ${line.qty}`);
            }
            if (lastClaimType && lastClaimType !== line.claim_type) {
              diffs.push(`claim type: ${lastClaimType} → ${line.claim_type}`);
            }

            if (diffs.length > 0) {
              // Log EDIT_RESET with diff
              let workshopId: string | null = null;
              const { data: jcRow } = await supabase
                .from('job_cards')
                .select('workshop_id')
                .eq('id', jobCardId)
                .maybeSingle();
              workshopId = jcRow?.workshop_id || null;

              const { data: userData } = await supabase.auth.getUser();
              if (userData?.user) {
                await supabase.from('job_card_spare_actions' as any).insert({
                  job_card_spare_id: editingSpare.id,
                  job_card_id: jobCardId,
                  workshop_id: workshopId,
                  action_type: 'EDIT_RESET',
                  comment: `Changed ${diffs.join('; ')}`,
                  actor_user_id: userData.user.id,
                } as any);
              }
            }
          }

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
          // Check if same part already exists on this job card (any claim type)
          const { data: existing } = await supabase
            .from('job_card_spares' as any)
            .select('id, qty, claim_type, serial_number')
            .eq('job_card_id', jobCardId)
            .eq('spare_part_id', line.spare_part_id);

          const existingRows = (existing || []) as any[];

          if (existingRows.length > 0) {
            const row = existingRows[0];
            const newQty = row.qty + line.qty;
            const maxQty = line.part?.max_qty_allowed || 50;

            if (newQty > maxQty) {
              toast.error(`Maximum quantity (${maxQty}) reached for ${line.part?.part_name || 'this part'}`);
              setSaving(false);
              return;
            }

            // Merge into existing row — update qty and optionally claim_type
            const { error } = await supabase
              .from('job_card_spares' as any)
              .update({
                qty: newQty,
                claim_type: line.claim_type,
                updated_by: profileId,
                serial_number: line.serial_number || row.serial_number || null,
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

  const handlePhotoCapture = (idx: number, kind: string, file: File) => {
    const newPhotos = [...lines[idx].newPhotos, file];
    const newKinds = [...lines[idx].newPhotoKinds, kind];
    updateLine(idx, { newPhotos, newPhotoKinds: newKinds });
  };

  const handlePhotoReplace = (idx: number, photoIdx: number, file: File) => {
    const newPhotos = [...lines[idx].newPhotos];
    newPhotos[photoIdx] = file;
    updateLine(idx, { newPhotos });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isEditMode ? 'Edit Spare Part' : 'Add Spare Parts'}
          </DrawerTitle>
          <DrawerDescription>
            {isEditMode ? 'Update this spare part record' : 'Record parts used for this job card'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                  className="cursor-pointer text-xs min-h-[32px]"
                  onClick={() => setActiveLineIdx(i)}
                >
                  {l.part?.part_name ? l.part.part_name.substring(0, 12) : `Part ${i + 1}`}
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={addLine}>
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
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Claim Type</Label>
                  {!warrantyEnabled ? (
                    <Input value="User Paid" disabled className="h-11" />
                  ) : (
                    <Select
                      value={currentLine.claim_type}
                      onValueChange={(val) => updateLine(activeLineIdx, { claim_type: val as ClaimType })}
                    >
                      <SelectTrigger className="h-11">
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
                    className="h-11 text-sm"
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
              {currentPart && currentPart.usage_proof_photos_required_count > 0 && (() => {
                const rawPrompts = currentPart.usage_proof_photo_prompts;
                const prompts: string[] = Array.isArray(rawPrompts)
                  ? rawPrompts as string[]
                  : (typeof rawPrompts === 'string' ? (() => { try { const p = JSON.parse(rawPrompts); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
                const requiredCount = currentPart.usage_proof_photos_required_count;
                const existingProof = currentLine.existingPhotos.filter(p => p.photo_kind === 'NEW_PART_PROOF');
                const newProofIndices = currentLine.newPhotoKinds
                  .map((k, i) => k === 'NEW_PART_PROOF' ? i : -1)
                  .filter(i => i >= 0);
                const filled = existingProof.length + newProofIndices.length;

                return (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      📷 New Part Proof Photos ({requiredCount} required)
                    </Label>

                    {/* Existing saved photos */}
                    {existingProof.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {existingProof.map(photo => (
                          <div key={photo.id} className="w-16 h-16 rounded-md overflow-hidden border bg-muted">
                            <img src={photo.photo_url} alt="Existing" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New captured photos with replace capability */}
                    {newProofIndices.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {newProofIndices.map(fi => (
                          <PhotoSlot
                            key={fi}
                            prompt={prompts[existingProof.length + newProofIndices.indexOf(fi)] || `Proof photo ${existingProof.length + newProofIndices.indexOf(fi) + 1}`}
                            suffix=""
                            capturedFile={currentLine.newPhotos[fi]}
                            onCapture={(file) => handlePhotoReplace(activeLineIdx, fi, file)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Remaining unfilled slots */}
                    {Array.from({ length: Math.max(0, requiredCount - filled) }).map((_, si) => {
                      const slotIdx = filled + si;
                      const promptText = prompts[slotIdx] || `Proof photo ${slotIdx + 1}`;
                      return (
                        <PhotoSlot
                          key={`slot-${si}`}
                          prompt={promptText}
                          onCapture={(file) => handlePhotoCapture(activeLineIdx, 'NEW_PART_PROOF', file)}
                        />
                      );
                    })}
                  </div>
                );
              })()}

              {/* Old-part evidence note */}
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
                  className="text-destructive h-11 text-xs"
                  onClick={() => removeLine(activeLineIdx)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove this part
                </Button>
              )}
            </div>
          )}
        </div>

        <DrawerFooter className="safe-bottom">
          <Button onClick={handleSave} disabled={saving || !allLinesValid} className="h-12">
            {saving ? 'Saving...' : isEditMode ? 'Update Spare' : 'Save Spares'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12">
            {isEditMode ? 'Cancel' : 'Skip'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
