import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import {
  ContactForUpdatesSelector,
  ContactData,
  maskPhone,
} from './ContactForUpdatesSelector';
import { toast } from 'sonner';

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerPhone: string | null | undefined;
  ownerName: string | null | undefined;
  workshopCountry: string | null | undefined;
  currentContact: ContactData;
  onConfirm: (data: ContactData, changeReason: string) => void;
}

export function EditContactDialog({
  open,
  onOpenChange,
  ownerPhone,
  ownerName,
  workshopCountry,
  currentContact,
  onConfirm,
}: EditContactDialogProps) {
  const [contactData, setContactData] = useState<ContactData>(currentContact);
  const [changeReason, setChangeReason] = useState('');

  // Reset state when dialog opens with new currentContact data
  useEffect(() => {
    if (open) {
      setContactData(currentContact);
      setChangeReason('');
    }
  }, [open, currentContact]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine if the contact actually changed
  const hasChanged =
    contactData.contact_for_updates !== currentContact.contact_for_updates ||
    (contactData.contact_for_updates === 'RIDER' &&
      contactData.rider_phone !== currentContact.rider_phone);

  const handleConfirm = () => {
    if (contactData.contact_for_updates === 'RIDER') {
      if (!contactData.rider_name.trim()) {
        toast.error('Rider name is required');
        return;
      }
      if (contactData.rider_phone.length !== 9) {
        toast.error('Rider phone must be exactly 9 digits');
        return;
      }
      if (!contactData.rider_reason) {
        toast.error('Reason is required');
        return;
      }
    }
    if (hasChanged && changeReason.trim().length < 5) {
      toast.error('Please provide a reason for the change (min 5 chars)');
      return;
    }
    onConfirm(contactData, hasChanged ? changeReason.trim() : '');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contact for OTP & Updates</DialogTitle>
          <DialogDescription>
            Change who receives OTP and status update SMS for this job card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ContactForUpdatesSelector
            ownerPhone={ownerPhone}
            ownerName={ownerName}
            workshopCountry={workshopCountry}
            value={contactData}
            onChange={setContactData}
          />

          {hasChanged && (
            <div className="space-y-2">
              <Label>Reason for change <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Why are you changing the contact? (min 5 chars)"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
