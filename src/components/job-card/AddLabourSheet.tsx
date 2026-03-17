import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { LabourMasterItem, JobCardLabourEntry } from '@/hooks/useLabour';

interface AddLabourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: LabourMasterItem[];
  editingEntry?: JobCardLabourEntry | null;
  onSave: (data: {
    labourMasterId: string;
    durationMinutes: number;
    rate: number | null;
    remarks: string | null;
  }) => Promise<void>;
  isSaving: boolean;
}

export function AddLabourSheet({
  open,
  onOpenChange,
  catalogue,
  editingEntry,
  onSave,
  isSaving,
}: AddLabourSheetProps) {
  const [selectedId, setSelectedId] = useState('');
  const [duration, setDuration] = useState(60);
  const [rate, setRate] = useState('');
  const [remarks, setRemarks] = useState('');

  const activeCatalogue = catalogue.filter(c => c.is_active);
  const selectedMaster = activeCatalogue.find(c => c.id === selectedId);

  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setSelectedId(editingEntry.labour_master_id);
        setDuration(editingEntry.duration_minutes);
        setRate(editingEntry.rate != null ? String(editingEntry.rate) : '');
        setRemarks(editingEntry.remarks || '');
      } else {
        setSelectedId('');
        setDuration(60);
        setRate('');
        setRemarks('');
      }
    }
  }, [open, editingEntry]);

  // When selecting a master item, auto-fill defaults
  useEffect(() => {
    if (!editingEntry && selectedMaster) {
      setDuration(selectedMaster.standard_duration_minutes);
      if (selectedMaster.default_rate != null) {
        setRate(String(selectedMaster.default_rate));
      }
    }
  }, [selectedId, selectedMaster, editingEntry]);

  const handleSubmit = async () => {
    if (!selectedId) return;
    await onSave({
      labourMasterId: selectedId,
      durationMinutes: duration,
      rate: rate ? parseFloat(rate) : null,
      remarks: remarks.trim() || null,
    });
  };

  const canEditDuration = selectedMaster?.duration_editable !== false;
  const canEditRate = selectedMaster?.rate_editable === true;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editingEntry ? 'Edit Labour' : 'Add Labour'}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {/* Labour select */}
          <div>
            <Label>Labour Item *</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={!!editingEntry}>
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

          {/* Duration */}
          <div>
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              min={1}
              disabled={!canEditDuration}
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
                disabled={!canEditRate}
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
            />
          </div>
        </div>
        <SheetFooter className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || isSaving}>
            {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {editingEntry ? 'Update' : 'Add'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
