import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wrench, ChevronDown, ChevronUp, User, MessageSquareText, ClipboardPen, Loader2 } from 'lucide-react';

interface ServiceDetailsSectionProps {
  serviceCategories: string[];
  issueCategories: string[];
  resolveCategoryName: (code: string) => string;
  getParentCode: (code: string) => string | null;
  canEditIssues: boolean;
  onEditIssues: () => void;
  customerComments?: string | null;
  completionRemarks?: string | null;
  assignedMechanicName?: string | null;
  mechanicNotes?: string | null;
  /** Whether inline mechanic note adding is allowed */
  canAddMechanicNote?: boolean;
  onAddMechanicNote?: (note: string) => Promise<void>;
  isExpanded?: boolean;
  onToggle?: () => void;
}

interface GroupedCategory {
  code: string;
  name: string;
  issues: { code: string; name: string }[];
}

const MAX_VISIBLE_ISSUES = 3;

export function ServiceDetailsSection({
  serviceCategories,
  issueCategories,
  resolveCategoryName,
  getParentCode,
  canEditIssues,
  onEditIssues,
  customerComments,
  completionRemarks,
  assignedMechanicName,
  mechanicNotes,
  canAddMechanicNote = false,
  onAddMechanicNote,
  isExpanded: controlledExpanded,
  onToggle,
}: ServiceDetailsSectionProps) {
  const grouped = useMemo<GroupedCategory[]>(() => {
    const cats = serviceCategories.map((cat) => {
      const issues = issueCategories
        .filter((issue) => getParentCode(issue) === cat)
        .map((code) => ({ code, name: resolveCategoryName(code) }));
      return { code: cat, name: resolveCategoryName(cat), issues };
    });

    const mappedCats = new Set(serviceCategories);
    const orphans = issueCategories
      .filter((issue) => !mappedCats.has(getParentCode(issue) ?? ''))
      .map((code) => ({ code, name: resolveCategoryName(code) }));

    if (orphans.length > 0) {
      cats.push({ code: '__orphan__', name: 'Other Issues', issues: orphans });
    }

    return cats;
  }, [serviceCategories, issueCategories, resolveCategoryName, getParentCode]);

  const totalCategories = serviceCategories.length;
  const totalIssues = issueCategories.length;

  const isControlled = controlledExpanded !== undefined;
  const autoExpand = (totalCategories + totalIssues) < 5;
  const [localExpanded, setLocalExpanded] = useState(autoExpand);
  const isExpanded = isControlled ? controlledExpanded : localExpanded;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalExpanded(!localExpanded);
  };

  // Inline note adding state
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !onAddMechanicNote) return;
    setIsSavingNote(true);
    try {
      await onAddMechanicNote(noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    } finally {
      setIsSavingNote(false);
    }
  };

  const subtitle = serviceCategories.length === 0 && issueCategories.length === 0
    ? 'No services selected'
    : `${totalCategories} ${totalCategories === 1 ? 'category' : 'categories'} · ${totalIssues} ${totalIssues === 1 ? 'issue' : 'issues'}`;

  return (
    <Card>
      <CardHeader className={isExpanded ? "pb-0" : ""}>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={handleToggle}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
            </CardTitle>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{subtitle}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 flex items-center gap-2 self-start mt-1">
            {canEditIssues && isExpanded && (
              <span
                role="button"
                tabIndex={0}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => { e.stopPropagation(); onEditIssues(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onEditIssues(); } }}
              >
                Edit
              </span>
            )}
            <span className="text-muted-foreground">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3">
          {/* 1. Service categories & issues */}
          {serviceCategories.length === 0 && issueCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services selected</p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.code}>
                  <p className="text-sm font-semibold text-foreground">{group.name}</p>
                  {group.issues.length > 0 && (
                    <ul className="mt-1.5 ml-3 space-y-1">
                      {group.issues.slice(0, MAX_VISIBLE_ISSUES).map((issue) => (
                        <li key={issue.code} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-muted-foreground/40 mt-0.5 text-xs">•</span>
                          <span>{issue.name}</span>
                        </li>
                      ))}
                      {group.issues.length > MAX_VISIBLE_ISSUES && (
                        <li className="text-xs text-muted-foreground/70 ml-4">
                          +{group.issues.length - MAX_VISIBLE_ISSUES} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 2. Customer Comments */}
          {customerComments && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Customer Comments</p>
              </div>
              <p className="text-sm whitespace-pre-wrap text-foreground/80 mt-0.5 ml-[22px]">{customerComments}</p>
            </>
          )}

          {/* 3. Assigned Mechanic — only shown when assigned */}
          {assignedMechanicName && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Assigned Mechanic</p>
              </div>
              <p className="text-sm text-foreground/90 mt-0.5 ml-[22px]">{assignedMechanicName}</p>
            </>
          )}

          {/* 4. Mechanic Notes — only shown when mechanic is assigned */}
          {assignedMechanicName && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardPen className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Mechanic Notes</p>
                </div>
                {canAddMechanicNote && !showNoteInput && (
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
            </>
          )}

          {/* 5. Completion Remarks */}
          {completionRemarks && (
            <>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground mb-1">Completion Remarks</p>
              <p className="text-sm">{completionRemarks}</p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
