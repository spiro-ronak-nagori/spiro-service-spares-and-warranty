import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Pencil, Lock } from 'lucide-react';

interface MechanicNameSectionProps {
  name: string | null;
  canEdit: boolean;
  locked: boolean;
  onEdit: () => void;
}

export function MechanicNameSection({ name, canEdit, locked, onEdit }: MechanicNameSectionProps) {
  if (!name) return null;

  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Assigned Mechanic</p>
          <p className="text-sm font-medium">{name}</p>
        </div>
        {locked ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-primary shrink-0"
            onClick={onEdit}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
