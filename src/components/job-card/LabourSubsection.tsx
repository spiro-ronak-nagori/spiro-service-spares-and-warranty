import { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Wrench, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { JobCardLabourEntry } from '@/hooks/useLabour';

interface LabourSubsectionProps {
  entries: JobCardLabourEntry[];
  isLoading: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onEdit: (entry: JobCardLabourEntry) => void;
  onRemove: (id: string) => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function LabourSubsection({
  entries,
  isLoading,
  canAdd,
  canEdit,
  canRemove,
  onAdd,
  onEdit,
  onRemove,
}: LabourSubsectionProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Labour</p>
      </div>

      {isLoading ? (
        <div className="mt-1.5 ml-[22px]">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 mt-0.5 ml-[22px]">No labour items added</p>
      ) : (
        <div className="mt-1.5 ml-[22px] space-y-2">
          {entries.map((entry) => {
            const master = entry.labour_master;
            const name = master?.labour_name || 'Unknown';
            return (
              <div key={entry.id} className="flex items-start gap-2 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/90">{name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDuration(entry.duration_minutes)}
                    </span>
                    {entry.rate != null && (
                      <span className="text-[11px] text-muted-foreground">
                        • Rate: {entry.rate}
                      </span>
                    )}
                  </div>
                  {entry.remarks && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{entry.remarks}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEdit && (
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {entries.length > 1 && (
            <p className="text-[11px] text-muted-foreground/60">
              Total: {formatDuration(totalMinutes)}
            </p>
          )}
        </div>
      )}

      {/* Add Labour CTA */}
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
