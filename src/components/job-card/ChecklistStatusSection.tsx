import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, CheckCircle2, MinusCircle, Loader2 } from 'lucide-react';

interface ChecklistStatusSectionProps {
  status: 'pending' | 'completed' | 'not_applicable' | 'loading';
  onComplete: () => void;
}

export function ChecklistStatusSection({ status, onComplete }: ChecklistStatusSectionProps) {
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

  if (status === 'not_applicable') {
    return (
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Inward Vehicle Checklist</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MinusCircle className="h-3 w-3" /> Not Applicable
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'completed') {
    return (
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Inward Vehicle Checklist</p>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // pending
  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Inward Vehicle Checklist</p>
          <p className="text-xs text-amber-600">Pending</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onComplete}>
          Complete
        </Button>
      </CardContent>
    </Card>
  );
}
