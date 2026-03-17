import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Assigned Mechanic
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{name}</p>
          </div>
          {locked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : canEdit ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary shrink-0"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}
