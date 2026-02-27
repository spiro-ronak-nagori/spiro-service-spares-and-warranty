import { useState } from 'react';
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
import { SparePart, ClaimType } from '@/types';
import { useApplicableSpareParts } from '@/hooks/useSparesFlow';
import { SearchablePartSelect } from '@/components/job-card/SearchablePartSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SpareLineInput {
  spare_part_id: string;
  part: SparePart | null;
  qty: number;
  claim_type: ClaimType;
  serial_number: string;
  comment: string;
  photos: File[];
  photoKinds: string[];
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
}

const emptyLine = (): SpareLineInput => ({
  spare_part_id: '',
  part: null,
  qty: 1,
  claim_type: 'USER_PAID',
  serial_number: '',
  comment: '',
  photos: [],
  photoKinds: [],
});

export function SparesModal({
  open, onOpenChange, jobCardId, profileId,
  vehicleModel, vehicleColorCode, warrantyEnabled, onSaved,
}: SparesModalProps) {
  const { parts, isLoading: partsLoading, warnings } = useApplicableSpareParts(vehicleModel, vehicleColorCode);
  const [lines, setLines] = useState<SpareLineInput[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(0);

  const updateLine = (idx: number, updates: Partial<SpareLineInput>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  };

  const selectPart = (idx: number, partId: string) => {
    const part = parts.find(p => p.id === partId) || null;
    updateLine(idx, {
      spare_part_id: partId,
      part,
      claim_type: warrantyEnabled ? lines[idx].claim_type : 'USER_PAID',
    });
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
    if (activeLineIdx >= lines.length - 1) setActiveLineIdx(Math.max(0, lines.length - 2));
  };

  const handleSave = async () => {
    const validLines = lines.filter(l => l.spare_part_id);
    if (validLines.length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      for (const line of validLines) {
        // Check for duplicate merge (same part + claim type)
        const { data: existing } = await supabase
          .from('job_card_spares' as any)
          .select('id, qty, serial_number')
          .eq('job_card_id', jobCardId)
          .eq('spare_part_id', line.spare_part_id)
          .eq('claim_type', line.claim_type);

        const existingRows = (existing || []) as any[];
        let spareId: string;

        // If serial_required and serial differs, keep separate
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

        // Upload photos
        for (let pi = 0; pi < line.photos.length; pi++) {
          const file = line.photos[pi];
          const kind = line.photoKinds[pi] || 'ADDITIONAL';
          const path = `${jobCardId}/${spareId}/${Date.now()}_${pi}.jpg`;

          const { error: uploadErr } = await supabase.storage
            .from('spare-photos')
            .upload(path, file);
          if (uploadErr) {
            console.error('Photo upload failed:', uploadErr);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from('spare-photos')
            .getPublicUrl(path);

          await supabase
            .from('job_card_spare_photos' as any)
            .insert({
              job_card_spare_id: spareId,
              photo_url: urlData.publicUrl,
              photo_kind: kind,
              uploaded_by: profileId,
            } as any);
        }
      }

      toast.success(`${validLines.length} spare(s) saved`);
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

  const currentLine = lines[activeLineIdx];
  const currentPart = currentLine?.part;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Add Spare Parts
          </DialogTitle>
          <DialogDescription>
            Record parts used for this job card
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

        {/* Line tabs */}
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

        {currentLine && (
          <div className="space-y-4">
            {/* Part selector with search */}
          <div className="space-y-2">
              <Label>Spare Part *</Label>
              <SearchablePartSelect
                parts={parts}
                value={currentLine.spare_part_id}
                onSelect={(val) => selectPart(activeLineIdx, val)}
                isLoading={partsLoading}
              />
            </div>

            {/* Qty */}
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

              {/* Claim type */}
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

            {/* Conditional: serial_number (unified) */}
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

            {/* Photo capture for NEW_PART_PROOF */}
            {currentPart && currentPart.usage_proof_photos_required_count > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  New Part Proof Photos ({currentPart.usage_proof_photos_required_count} required)
                </Label>
                {(currentPart.usage_proof_photo_prompts as string[]).map((prompt, pi) => (
                  <div key={pi} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{prompt}</p>
                    <Input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const newPhotos = [...currentLine.photos];
                          const newKinds = [...currentLine.photoKinds];
                          newPhotos.push(file);
                          newKinds.push('NEW_PART_PROOF');
                          updateLine(activeLineIdx, { photos: newPhotos, photoKinds: newKinds });
                        }
                      }}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* OLD_PART_EVIDENCE photos - only if warranty flow ON + claim type WARRANTY/GOODWILL */}
            {warrantyEnabled && currentPart && currentLine.claim_type !== 'USER_PAID' && (() => {
              const isWarranty = currentLine.claim_type === 'WARRANTY';
              const count = isWarranty
                ? currentPart.warranty_old_part_photos_required_count
                : currentPart.goodwill_old_part_photos_required_count;
              const prompts = isWarranty
                ? currentPart.warranty_old_part_photo_prompts as string[]
                : currentPart.goodwill_old_part_photo_prompts as string[];

              if (count <= 0) return null;

              return (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5" />
                    Old Part Evidence Photos ({count} required)
                  </Label>
                  {prompts.map((prompt, pi) => (
                    <div key={pi} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{prompt}</p>
                      <Input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const newPhotos = [...currentLine.photos];
                            const newKinds = [...currentLine.photoKinds];
                            newPhotos.push(file);
                            newKinds.push('OLD_PART_EVIDENCE');
                            updateLine(activeLineIdx, { photos: newPhotos, photoKinds: newKinds });
                          }
                        }}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Remove line */}
            {lines.length > 1 && (
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
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Spares'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
