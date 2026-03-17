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

  const [isExpanded, setIsExpanded] = useState(false);

  const summaryLine = (() => {
    const catNames = grouped.filter((g) => g.code !== '__orphan__').map((g) => g.name);
    const maxShow = 3;
    if (catNames.length <= maxShow) return catNames.join(', ');
    return `${catNames.slice(0, maxShow).join(', ')} +${catNames.length - maxShow} more`;
  })();

  const subtitle = serviceCategories.length === 0 && issueCategories.length === 0
    ? 'No services selected'
    : `${totalCategories} ${totalCategories === 1 ? 'category' : 'categories'} · ${totalIssues} ${totalIssues === 1 ? 'issue' : 'issues'}`;

  return (
    <Card>
      <CardHeader className={isExpanded ? "pb-0" : ""}>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
            </CardTitle>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{subtitle}{totalIssues > 0 ? ` · ${summaryLine}` : ''}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3">
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

          {canEditIssues && (
            <div className="pt-3 border-t border-border mt-4">
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
