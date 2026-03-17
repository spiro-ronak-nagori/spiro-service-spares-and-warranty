import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Hammer, ChevronDown, ChevronUp, User, ClipboardPen, Loader2 } from 'lucide-react';

interface WorkExecutionSectionProps {
  assignedMechanicName?: string | null;
  mechanicNotes?: string | null;
  canAddNote?: boolean;
  onAddNote?: (note: string) => Promise<void>;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function WorkExecutionSection({
  assignedMechanicName,
  mechanicNotes,
  canAddNote = false,
  onAddNote,
  isExpanded: controlledExpanded,
  onToggle,
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

  // Collapsed subtitle: mechanic name or latest note line
  const latestNoteLine = mechanicNotes
    ? mechanicNotes.split('\n').filter(Boolean).pop() || null
    : null;
  const subtitle = assignedMechanicName || latestNoteLine || 'No notes yet';

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

          {/* 2. Work Notes */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardPen className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Work Notes</p>
            </div>
            {canAddNote && !showNoteInput && (
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => setShowNoteInput(true)}
              >
                + Add Note
              </button>
            )}
          </div>
          {mechanicNotes ? (
            <p className="text-sm whitespace-pre-wrap text-foreground/80 mt-0.5 ml-[22px]">{mechanicNotes}</p>
          ) : !showNoteInput ? (
            <p className="text-xs text-muted-foreground/60 mt-0.5 ml-[22px]">No notes yet</p>
          ) : null}

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
