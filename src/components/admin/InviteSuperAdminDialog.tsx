import { useState } from 'react';
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
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface InviteSuperAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteSuperAdminDialog({ open, onOpenChange, onCreated }: InviteSuperAdminDialogProps) {
  const { profile } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [identifierError, setIdentifierError] = useState('');

  const resetForm = () => {
    setName('');
    setEmail('');
    setIdentifierError('');
  };

  const handleCreate = async () => {
    if (!profile) return;
    setIdentifierError('');

    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!email.trim()) { toast.error('Email is required for Super Admin accounts'); return; }
    if (!EMAIL_RE.test(email.trim())) { toast.error('Please enter a valid email address'); return; }

    setIsCreating(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Global dedupe check
      const { data: checkResult } = await supabase.functions.invoke('check-invite', {
        body: { dedupe_only: true, email: normalizedEmail },
      });

      if (checkResult?.error) {
        setIdentifierError(checkResult.error);
        setIsCreating(false);
        return;
      }

      const { error } = await supabase
        .from('user_invites')
        .insert({
          full_name: name.trim(),
          role: 'super_admin' as any,
          workshop_id: null,
          country: null,
          invited_by: profile.id,
          email: normalizedEmail,
          phone: null,
        } as any);

      if (error) throw error;

      toast.success(`Super Admin invite sent to ${name.trim()}`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      console.error('Error creating super admin invite:', error);
      toast.error(error.message || 'Failed to create invite');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-sm max-h-[calc(100vh-48px)] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Add Super Admin
          </DialogTitle>
          <DialogDescription>
            Invite a new Super Admin user. Email is required for Super Admin accounts.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Email <span className="text-destructive">*</span></Label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setIdentifierError(''); }}
            />
          </div>

          {identifierError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {identifierError}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            The invited user will receive an activation link to set their password.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }} disabled={isCreating}>
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
