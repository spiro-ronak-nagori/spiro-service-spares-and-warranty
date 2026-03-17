import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const isLargeDataset = totalCategories > 5 || totalIssues > 10;

  // Default: always collapsed
  const [isExpanded, setIsExpanded] = useState(false);

  if (serviceCategories.length === 0 && issueCategories.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Service Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No services selected</p>
          {canEditIssues && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
              onClick={onEditIssues}
            >
              <Pencil className="h-3 w-3" />
              Edit Issues
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Collapsed summary
  const summaryLine = (() => {
    const catNames = grouped.filter((g) => g.code !== '__orphan__').map((g) => g.name);
    const maxShow = 3;
    if (catNames.length <= maxShow) return catNames.join(', ');
    return `${catNames.slice(0, maxShow).join(', ')} +${catNames.length - maxShow} more`;
  })();

  return (
    <Card>
      <CardHeader className="pb-0">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
              <span className="text-xs font-normal text-muted-foreground">
                {totalCategories} {totalCategories === 1 ? 'category' : 'categories'} • {totalIssues} {totalIssues === 1 ? 'issue' : 'issues'}
              </span>
            </CardTitle>
            {!isExpanded && (
              <p className="text-sm text-muted-foreground truncate mt-1 ml-6">{summaryLine}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3 space-y-0">
          <div className={isLargeDataset ? 'space-y-2' : 'space-y-3'}>
            {grouped.map((group) => (
              <div key={group.code}>
                {isLargeDataset ? (
                  <div className="text-sm">
                    <span className="font-semibold text-foreground">{group.name}</span>
                    {group.issues.length > 0 && (
                      <span className="text-muted-foreground">
                        {' '}({group.issues.length}) •{' '}
                        {group.issues.length <= 3
                          ? group.issues.map((i) => i.name).join(', ')
                          : `${group.issues.slice(0, 2).map((i) => i.name).join(', ')} +${group.issues.length - 2}`}
                      </span>
                    )}
                  </div>
                ) : (
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

          {/* Secondary CTA inside expanded view */}
          {canEditIssues && (
            <div className="pt-3 border-t border-border mt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                onClick={onEditIssues}
              >
                <Pencil className="h-3 w-3" />
                Edit Issues
              </button>
            </div>
          )}

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
      )}
    </Card>
  );
}
