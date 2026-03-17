import { useState, useMemo } from 'react';
import { Wrench, Plus, Loader2, Pencil } from 'lucide-react';
import { JobCardLabourEntry } from '@/hooks/useLabour';

/** Aggregated labour row: one per labour_master_id */
export interface AggregatedLabourRow {
  /** All underlying entry IDs */
  entryIds: string[];
  /** Primary entry (first added) — used for edit/remove */
  primaryEntry: JobCardLabourEntry;
  labourMasterId: string;
  labourName: string;
  labourCode: string | null;
  totalMinutes: number;
  /** Weighted average rate or null */
  rate: number | null;
  /** Concatenated remarks */
  remarks: string | null;
}

interface LabourSubsectionProps {
  entries: JobCardLabourEntry[];
  isLoading: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onEditAggregated: (row: AggregatedLabourRow) => void;
  onRemoveAggregated: (row: AggregatedLabourRow) => void;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function aggregateLabourEntries(entries: JobCardLabourEntry[]): AggregatedLabourRow[] {
  const map = new Map<string, AggregatedLabourRow>();

  for (const entry of entries) {
    const key = entry.labour_master_id;
    const existing = map.get(key);
    if (existing) {
      existing.entryIds.push(entry.id);
      existing.totalMinutes += entry.duration_minutes;
      // Keep latest remarks if any
      if (entry.remarks) {
        existing.remarks = existing.remarks
          ? `${existing.remarks}; ${entry.remarks}`
          : entry.remarks;
      }
    } else {
      const master = entry.labour_master;
      map.set(key, {
        entryIds: [entry.id],
        primaryEntry: entry,
        labourMasterId: key,
        labourName: master?.labour_name || 'Unknown',
        labourCode: master?.labour_code || null,
        totalMinutes: entry.duration_minutes,
        rate: entry.rate,
        remarks: entry.remarks,
      });
    }
  }

  return Array.from(map.values());
}

export function LabourSubsection({
  entries,
  isLoading,
  canAdd,
  canEdit,
  canRemove,
  onAdd,
  onEditAggregated,
  onRemoveAggregated,
}: LabourSubsectionProps) {
  const rows = useMemo(() => aggregateLabourEntries(entries), [entries]);
  const totalMinutes = rows.reduce((sum, r) => sum + r.totalMinutes, 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Labour</p>
      </div>

      {isLoading ? (
        <div className="mt-1 ml-[22px]">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 mt-1 ml-[22px]">No labour added yet</p>
      ) : (
        <div className="mt-1 ml-[22px] space-y-1">
          {rows.map((row) => (
            <button
              key={row.labourMasterId}
              type="button"
              className="flex items-center justify-between w-full text-left py-1 -mx-1 px-1 rounded-md hover:bg-muted/50 transition-colors active:bg-muted/70"
              onClick={() => {
                if (canEdit || canRemove) onEditAggregated(row);
              }}
              disabled={!canEdit && !canRemove}
            >
              <span className="text-sm text-foreground/90 truncate mr-3">
                {row.labourName}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums shrink-0">
                {formatDuration(row.totalMinutes)}
                {(canEdit || canRemove) && <Pencil className="h-3 w-3 text-muted-foreground/60" />}
              </span>
            </button>
          ))}

          {rows.length > 1 && (
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {formatDuration(totalMinutes)}
              </span>
            </div>
          )}
        </div>
      )}

      {canAdd && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-primary mt-3 ml-[22px]"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" />
          Add Labour
        </button>
      )}
    </div>
  );
}
