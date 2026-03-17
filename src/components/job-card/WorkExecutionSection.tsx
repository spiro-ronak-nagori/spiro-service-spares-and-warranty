import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Hammer, ChevronDown, ChevronUp, User, ClipboardPen, Loader2, Plus } from 'lucide-react';
import { LabourSubsection, AggregatedLabourRow } from './LabourSubsection';
import { JobCardLabourEntry } from '@/hooks/useLabour';

interface WorkExecutionSectionProps {
  assignedMechanicName?: string | null;
  mechanicNotes?: string | null;
  canAddNote?: boolean;
  onAddNote?: (note: string) => Promise<void>;
  isExpanded?: boolean;
  onToggle?: () => void;
  // Labour props
  labourEnabled?: boolean;
  labourEntries?: JobCardLabourEntry[];
  labourLoading?: boolean;
  canAddLabour?: boolean;
  canEditLabour?: boolean;
  canRemoveLabour?: boolean;
  onAddLabour?: () => void;
  onEditAggregated?: (row: AggregatedLabourRow) => void;
  onRemoveAggregated?: (row: AggregatedLabourRow) => void;
}

/** Parse "[dd MMM HH:mm] note text" lines into structured entries */
function parseNotes(raw: string | null | undefined): { text: string; timestamp: string }[] {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      return { timestamp: match[1], text: match[2] };
    }
    return { timestamp: '', text: line };
  });
}

// formatDuration now imported from LabourSubsection
import { formatDuration } from './LabourSubsection';

export function WorkExecutionSection({
  assignedMechanicName,
  mechanicNotes,
  canAddNote = false,
  onAddNote,
  isExpanded: controlledExpanded,
  onToggle,
  labourEnabled = false,
  labourEntries = [],
  labourLoading = false,
  canAddLabour = false,
  canEditLabour = false,
  canRemoveLabour = false,
  onAddLabour,
  onEditLabour,
  onRemoveLabour,
}: WorkExecutionSectionProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !onAddNote) return;
    setIsSavingNote(true);
    try {
      await onAddNote(noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    } finally {
      setIsSavingNote(false);
    }
  };

  const isExpanded = controlledExpanded ?? false;
  const parsedNotes = useMemo(() => parseNotes(mechanicNotes), [mechanicNotes]);

  // Collapsed subtitle priority: mechanic → labour summary → latest note → empty
  const latestNote = parsedNotes.length > 0 ? parsedNotes[parsedNotes.length - 1].text : null;
  const labourSummary = labourEnabled && labourEntries.length > 0
    ? `${labourEntries.length} labour item${labourEntries.length > 1 ? 's' : ''} • ${formatDuration(labourEntries.reduce((s, e) => s + e.duration_minutes, 0))}`
    : null;
  const subtitle = assignedMechanicName || labourSummary || latestNote || 'No notes yet';

  return (
    <Card>
      <CardHeader className={isExpanded ? 'pb-0' : ''}>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={onToggle}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Hammer className="h-4 w-4" />
              Work Execution
            </CardTitle>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{subtitle}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3">
          {/* 1. Assigned Mechanic */}
          {assignedMechanicName && (
            <>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Assigned Mechanic</p>
              </div>
              <p className="text-sm text-foreground/90 mt-0.5 ml-[22px]">{assignedMechanicName}</p>
              <Separator className="my-3" />
            </>
          )}

          {/* 2. Labour subsection */}
          {labourEnabled && (
            <>
              <LabourSubsection
                entries={labourEntries}
                isLoading={labourLoading}
                canAdd={canAddLabour}
                canEdit={canEditLabour}
                canRemove={canRemoveLabour}
                onAdd={onAddLabour || (() => {})}
                onEdit={onEditLabour || (() => {})}
                onRemove={onRemoveLabour || (() => {})}
              />
              <Separator className="my-3" />
            </>
          )}

          {/* 3. Work Notes */}
          <div className="flex items-center gap-2">
            <ClipboardPen className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Work Notes</p>
          </div>

          {parsedNotes.length > 0 ? (
            <div className="mt-1.5 ml-[22px] space-y-2.5">
              {parsedNotes.map((note, i) => (
                <div key={i}>
                  <p className="text-sm text-foreground/90">{note.text}</p>
                  {note.timestamp && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {note.timestamp.replace(/\s(?=\d{1,2}:\d{2})/, ' • ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : !showNoteInput ? (
            <p className="text-xs text-muted-foreground/60 mt-0.5 ml-[22px]">No notes yet</p>
          ) : null}

          {/* Add Note CTA — anchored below notes */}
          {canAddNote && !showNoteInput && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-primary mt-3 ml-[22px]"
              onClick={() => setShowNoteInput(true)}
            >
              <Plus className="h-3 w-3" />
              Add Note
            </button>
          )}

          {/* Inline note input */}
          {showNoteInput && (
            <div className="mt-2 ml-[22px] space-y-2">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                className="min-h-[60px] text-sm"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                  disabled={isSavingNote}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNote}
                  disabled={!noteText.trim() || isSavingNote}
                >
                  {isSavingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
