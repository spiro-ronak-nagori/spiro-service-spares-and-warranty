import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Wrench, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

interface ServiceDetailsSectionProps {
  serviceCategories: string[];
  issueCategories: string[];
  resolveCategoryName: (code: string) => string;
  getParentCode: (code: string) => string | null;
  canEditIssues: boolean;
  onEditIssues: () => void;
  customerComments?: string | null;
  completionRemarks?: string | null;
}

interface GroupedCategory {
  code: string;
  name: string;
  issues: { code: string; name: string }[];
}

export function ServiceDetailsSection({
  serviceCategories,
  issueCategories,
  resolveCategoryName,
  getParentCode,
  canEditIssues,
  onEditIssues,
  customerComments,
  completionRemarks,
}: ServiceDetailsSectionProps) {
  // Build grouped data
  const grouped = useMemo<GroupedCategory[]>(() => {
    const cats = serviceCategories.map((cat) => {
      const issues = issueCategories
        .filter((issue) => getParentCode(issue) === cat)
        .map((code) => ({ code, name: resolveCategoryName(code) }));
      return { code: cat, name: resolveCategoryName(cat), issues };
    });

    // Orphan issues
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
  const isLargeDataset = totalCategories > 5 || totalIssues > 10;

  // Adaptive: auto-expand if small dataset
  const [isExpanded, setIsExpanded] = useState(totalIssues <= 5);

  if (serviceCategories.length === 0 && issueCategories.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
            </CardTitle>
            {canEditIssues && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" onClick={onEditIssues}>
                <Pencil className="h-3.5 w-3.5" />
                Edit Issues
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No services selected</p>
        </CardContent>
      </Card>
    );
  }

  // Build collapsed summary
  const summaryLine = (() => {
    const catNames = grouped.filter((g) => g.code !== '__orphan__').map((g) => g.name);
    const maxShow = 3;
    if (catNames.length <= maxShow) {
      return catNames.join(', ');
    }
    return `${catNames.slice(0, maxShow).join(', ')} +${catNames.length - maxShow} more`;
  })();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Service Details
          </CardTitle>
          {canEditIssues && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" onClick={onEditIssues}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Issues
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        {/* Summary bar — always visible */}
        <button
          type="button"
          className="w-full flex items-center justify-between py-2 text-left group"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {totalCategories} {totalCategories === 1 ? 'category' : 'categories'} • {totalIssues} {totalIssues === 1 ? 'issue' : 'issues'}
            </p>
            {!isExpanded && (
              <p className="text-sm text-foreground/80 truncate mt-0.5">{summaryLine}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className={`pt-1 ${isLargeDataset ? 'space-y-2' : 'space-y-3'}`}>
            {grouped.map((group) => (
              <div key={group.code}>
                {isLargeDataset ? (
                  // Compact mode: single line per category
                  <div className="text-sm">
                    <span className="font-semibold text-foreground">{group.name}</span>
                    {group.issues.length > 0 && (
                      <span className="text-muted-foreground">
                        {' '}({group.issues.length}) •{' '}
                        {group.issues.length <= 3
                          ? group.issues.map((i) => i.name).join(', ')
                          : `${group.issues.slice(0, 2).map((i) => i.name).join(', ')} +${group.issues.length - 2}`
                        }
                      </span>
                    )}
                  </div>
                ) : (
                  // Normal expanded mode: category heading + bullet list
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {group.name}
                      {group.issues.length > 0 && (
                        <span className="font-normal text-muted-foreground ml-1">({group.issues.length})</span>
                      )}
                    </p>
                    {group.issues.length > 0 && (
                      <ul className="mt-1 ml-1 space-y-0.5">
                        {group.issues.map((issue) => (
                          <li key={issue.code} className="text-sm text-muted-foreground flex items-start gap-1.5">
                            <span className="text-muted-foreground/50 mt-0.5">•</span>
                            <span>{issue.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Customer comments & completion remarks */}
        {customerComments && (
          <>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground mb-1">Customer Comments</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/80">{customerComments}</p>
          </>
        )}

        {completionRemarks && (
          <>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground mb-1">Completion Remarks</p>
            <p className="text-sm">{completionRemarks}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
