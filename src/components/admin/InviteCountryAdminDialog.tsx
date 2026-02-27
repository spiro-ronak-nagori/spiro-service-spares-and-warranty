import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Globe, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCountries } from '@/hooks/useCountries';

interface InviteCountryAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function InviteCountryAdminDialog({ open, onOpenChange, onCreated }: InviteCountryAdminDialogProps) {
  const { profile } = useAuth();
  const { countries, buildE164Phone, getCallingCode } = useCountries();
  const [isCreating, setIsCreating] = useState(false);
  const [country, setCountry] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identifierError, setIdentifierError] = useState('');

  // Derive calling code from selected country (locked)
  const callingCode = getCallingCode(country);

  const resetForm = () => {
    setCountry('');
    setName('');
    setEmail('');
    setPhone('');
    setIdentifierError('');
  };

  const handleCountryChange = (value: string) => {
    setCountry(value);
    setPhone(''); // reset phone when country changes
  };

  const handleCreate = async () => {
    if (!profile) return;
    setIdentifierError('');

    if (!country) { toast.error('Country is required'); return; }
    if (!name.trim()) { toast.error('Name is required'); return; }

    const hasEmail = !!email.trim();
    const hasPhone = !!phone.trim();

    if (!hasEmail && !hasPhone) {
      toast.error('At least one of email or phone is required');
      return;
    }

    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) { toast.error('Please enter a valid email address'); return; }
    }

    if (hasPhone && phone.replace(/\D/g, '').length !== 9) {
      toast.error('Phone must be exactly 9 digits');
      return;
    }

    setIsCreating(true);

    try {
      const normalizedEmail = hasEmail ? email.toLowerCase().trim() : null;
      const e164Phone = hasPhone ? buildE164Phone(country, phone) : null;

      if (hasPhone && !e164Phone) {
        toast.error('Could not determine calling code for selected country');
        setIsCreating(false);
        return;
      }

      // Global dedupe check
      const dedupeBody: Record<string, any> = { dedupe_only: true };
      if (normalizedEmail) dedupeBody.email = normalizedEmail;
      if (e164Phone) dedupeBody.phone = e164Phone;

      const { data: checkResult } = await supabase.functions.invoke('check-invite', {
        body: dedupeBody,
      });

      if (checkResult?.error) {
        setIdentifierError(checkResult.error);
        setIsCreating(false);
        return;
      }

      // Create invite with country_admin role
      const insertData: Record<string, any> = {
        full_name: name.trim(),
        role: 'country_admin' as any,
        workshop_id: null,
        country: country,
        invited_by: profile.id,
      };
      if (normalizedEmail) insertData.email = normalizedEmail;
      if (e164Phone) insertData.phone = e164Phone;

      const { error } = await supabase
        .from('user_invites')
        .insert(insertData as any);

      if (error) throw error;

      toast.success(`Country Admin invite sent to ${name.trim()}`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      console.error('Error creating country admin invite:', error);
      toast.error(error.message || 'Failed to create invite');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[calc(100vh-48px)] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Add Country Admin
          </DialogTitle>
          <DialogDescription>
            Invite a Country Admin to manage workshops in a specific country
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label>Country <span className="text-destructive">*</span></Label>
            <Select value={country} onValueChange={handleCountryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Full Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setIdentifierError(''); }}
            />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <div className="flex gap-2">
              <div className="w-[120px] shrink-0">
                <Input
                  value={callingCode ? `${country} (${callingCode})` : 'Select country'}
                  readOnly
                  className="bg-muted text-sm"
                  disabled={!country}
                />
              </div>
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={country ? '712345678' : 'Select country first'}
                  value={phone}
                  disabled={!country}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                    setPhone(digits);
                    setIdentifierError('');
                  }}
                  maxLength={9}
                />
              </div>
            </div>
          </div>

          {identifierError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {identifierError}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            At least one of email or phone is required. Phone country code is locked to the selected country.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Send Invite'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
