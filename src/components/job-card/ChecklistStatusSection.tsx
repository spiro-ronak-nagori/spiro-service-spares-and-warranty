import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface ChecklistStatusSectionProps {
  status: 'pending' | 'completed' | 'not_applicable' | 'loading';
  onComplete: () => void;
}

export function ChecklistStatusSection({ status }: ChecklistStatusSectionProps) {
  if (status === 'loading') {
    return (
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Inward Vehicle Checklist
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground ml-6 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </p>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'completed') {
    return (
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Inward Vehicle Checklist
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground ml-6 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-primary" /> Completed
          </p>
        </CardHeader>
      </Card>
    );
  }

  // pending — neutral inline alert, no colored background
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Inward Vehicle Checklist
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground ml-6 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Vehicle checklist pending
        </p>
      </CardHeader>
    </Card>
  );
}
