import { useState, useEffect, useMemo } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import { LabourMasterItem, JobCardLabourEntry } from '@/hooks/useLabour';
import { AggregatedLabourRow, formatDuration } from '@/components/job-card/LabourSubsection';

interface AddLabourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: LabourMasterItem[];
  /** Existing entries on this JC — used to detect aggregation */
  existingEntries: JobCardLabourEntry[];
  /** When editing an aggregated row */
  editingRow?: AggregatedLabourRow | null;
  onSave: (data: {
    labourMasterId: string;
    durationMinutes: number;
    rate: number | null;
    remarks: string | null;
  }) => Promise<void>;
  onRemove?: () => void;
  isSaving: boolean;
  canEdit: boolean;
  canRemove: boolean;
}

export function AddLabourSheet({
  open,
  onOpenChange,
  catalogue,
  existingEntries,
  editingRow,
  onSave,
  onRemove,
  isSaving,
  canEdit,
  canRemove,
}: AddLabourSheetProps) {
  const [selectedId, setSelectedId] = useState('');
  const [duration, setDuration] = useState(60);
  const [rate, setRate] = useState('');
  const [remarks, setRemarks] = useState('');

  const activeCatalogue = catalogue.filter(c => c.is_active);
  const selectedMaster = activeCatalogue.find(c => c.id === selectedId);

  // Check if selected type already has entries (for add mode aggregation hint)
  const existingForType = useMemo(() => {
    if (editingRow || !selectedId) return null;
    const matching = existingEntries.filter(e => e.labour_master_id === selectedId);
    if (matching.length === 0) return null;
    const totalMinutes = matching.reduce((s, e) => s + e.duration_minutes, 0);
    return { totalMinutes, count: matching.length };
  }, [selectedId, existingEntries, editingRow]);

  useEffect(() => {
    if (open) {
      if (editingRow) {
        setSelectedId(editingRow.labourMasterId);
        setDuration(editingRow.totalMinutes);
        setRate(editingRow.rate != null ? String(editingRow.rate) : '');
        setRemarks(editingRow.remarks || '');
      } else {
        setSelectedId('');
        setDuration(60);
        setRate('');
        setRemarks('');
      }
    }
  }, [open, editingRow]);

  // When selecting a master item in add mode, auto-fill defaults
  useEffect(() => {
    if (!editingRow && selectedMaster) {
      setDuration(selectedMaster.standard_duration_minutes);
      if (selectedMaster.default_rate != null) {
        setRate(String(selectedMaster.default_rate));
      }
    }
  }, [selectedId, selectedMaster, editingRow]);

  const handleSubmit = async () => {
    if (!selectedId) return;
    await onSave({
      labourMasterId: selectedId,
      durationMinutes: duration,
      rate: rate ? parseFloat(rate) : null,
      remarks: remarks.trim() || null,
    });
  };

  const canEditDuration = editingRow ? true : selectedMaster?.duration_editable !== false;
  const canEditRate = selectedMaster?.rate_editable === true;
  const isEditMode = !!editingRow;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditMode ? 'Edit Labour' : 'Add Labour'}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {/* Labour select */}
          <div>
            <Label>Labour Item *</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={isEditMode}>
              <SelectTrigger>
                <SelectValue placeholder="Select labour…" />
              </SelectTrigger>
              <SelectContent>
                {activeCatalogue.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.labour_name}
                    {item.labour_code ? ` (${item.labour_code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aggregation hint in add mode */}
          {!isEditMode && existingForType && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              This type already has {formatDuration(existingForType.totalMinutes)} logged.
              Adding {formatDuration(duration)} will bring the total to{' '}
              <span className="font-medium text-foreground">
                {formatDuration(existingForType.totalMinutes + duration)}
              </span>.
            </p>
          )}

          {/* Duration */}
          <div>
            <Label>{isEditMode ? 'Total Duration (minutes)' : 'Duration (minutes)'}</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              min={1}
              disabled={!canEditDuration || (isEditMode && !canEdit)}
            />
          </div>

          {/* Rate */}
          {(selectedMaster?.default_rate != null || canEditRate) && (
            <div>
              <Label>Rate / Amount</Label>
              <Input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                step="0.01"
                disabled={!canEditRate || (isEditMode && !canEdit)}
                placeholder="Optional"
              />
            </div>
          )}

          {/* Remarks */}
          <div>
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks…"
              rows={2}
              disabled={isEditMode && !canEdit}
            />
          </div>
        </div>
        <SheetFooter className="flex gap-2">
          {isEditMode && canRemove && onRemove && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={onRemove}
              disabled={isSaving}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          {(!isEditMode || canEdit) && (
            <Button onClick={handleSubmit} disabled={!selectedId || duration <= 0 || isSaving}>
              {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {isEditMode ? 'Update' : 'Add'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
