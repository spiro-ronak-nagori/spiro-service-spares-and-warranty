import { Card, CardContent } from '@/components/ui/card';
import { ClipboardCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface ChecklistStatusSectionProps {
  status: 'pending' | 'completed' | 'not_applicable' | 'loading';
  onComplete: () => void;
}

export function ChecklistStatusSection({ status }: ChecklistStatusSectionProps) {
  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Inward Vehicle Checklist</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking…
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'completed') {
    return (
      <Card className="border-green-200/50">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Inward Vehicle Checklist</p>
            <p className="text-xs text-green-600 flex items-center gap-1">
              Completed
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // pending — warning state, no button (CTA is in sticky bar)
  return (
    <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Inward Vehicle Checklist</p>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            ⚠ Pending — Required before starting work
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
