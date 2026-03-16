import { useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MechanicNameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string | null;
  onSave: (name: string) => void;
  isSaving?: boolean;
}

export function MechanicNameSheet({
  open,
  onOpenChange,
  currentName,
  onSave,
  isSaving,
}: MechanicNameSheetProps) {
  const [name, setName] = useState(currentName || '');

  // Reset when opened
  const handleOpenChange = (val: boolean) => {
    if (val) setName(currentName || '');
    onOpenChange(val);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Assigned Mechanic</DrawerTitle>
          <DrawerDescription>
            Enter the name of the mechanic who will work on this vehicle.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-2">
          <Label htmlFor="mechanic-name" className="text-sm font-medium">
            Mechanic Name
          </Label>
          <Input
            id="mechanic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter mechanic name"
            className="mt-1.5"
            autoFocus
          />
        </div>
        <DrawerFooter>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isSaving}
            className="w-full"
          >
            {isSaving ? 'Saving…' : 'Save & Start Work'}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
