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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, UserPlus, Building2, Search, MapPin, X, ChevronLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Workshop } from '@/types';
import { useCountries } from '@/hooks/useCountries';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workshopId: string;
  onInvited: () => void;
  allowAdminRole?: boolean;
  /** When true, shows a workshop selector step before the invite form */
  requireWorkshopSelection?: boolean;
}

export function InviteUserDialog({
  open,
  onOpenChange,
  workshopId,
  onInvited,
  allowAdminRole = false,
  requireWorkshopSelection = false,
}: InviteUserDialogProps) {
  const { profile } = useAuth();
  const { countries, buildE164Phone } = useCountries();
  const [isInviting, setIsInviting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('');
  const [role, setRole] = useState<'workshop_admin' | 'technician'>('technician');
  const [identifierError, setIdentifierError] = useState('');

  // Workshop selection state
  const [step, setStep] = useState<'workshop' | 'form'>(requireWorkshopSelection ? 'workshop' : 'form');
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoadingWorkshops, setIsLoadingWorkshops] = useState(false);
  const [workshopSearch, setWorkshopSearch] = useState('');

  const effectiveWorkshopId = selectedWorkshop?.id || workshopId;

  const isCountryAdmin = profile?.role === 'country_admin';

  useEffect(() => {
    if (open && requireWorkshopSelection) {
      setStep('workshop');
      setSelectedWorkshop(null);
      fetchWorkshops();
    } else if (open) {
      setStep('form');
    }
  }, [open, requireWorkshopSelection]);

  // Default phoneCountry to first available country
  useEffect(() => {
    if (countries.length > 0 && !phoneCountry) {
      setPhoneCountry(countries[0].name);
    }
  }, [countries]);

  const fetchWorkshops = async () => {
    setIsLoadingWorkshops(true);
    try {
      let query = supabase.from('workshops').select('*').order('name');
      if (isCountryAdmin && profile?.country) {
        query = query.eq('country', profile.country);
      }
      const { data, error } = await query;
      if (error) throw error;
      setWorkshops(
        (data || []).map((w: any) => ({
          ...w,
          type: w.type as Workshop['type'],
          grade: w.grade as Workshop['grade'],
        }))
      );
    } catch (err) {
      console.error('Error fetching workshops:', err);
    } finally {
      setIsLoadingWorkshops(false);
    }
  };

  const filteredWorkshops = workshops.filter((w) => {
    if (!workshopSearch) return true;
    const q = workshopSearch.toLowerCase();
    return w.name.toLowerCase().includes(q) || w.city?.toLowerCase().includes(q) || w.country?.toLowerCase().includes(q);
  });

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPhoneCountry(countries.length > 0 ? countries[0].name : '');
    setRole('technician');
    setWorkshopSearch('');
    setSelectedWorkshop(null);
    setIdentifierError('');
  };

  const handleInvite = async () => {
    if (!profile || !effectiveWorkshopId) return;
    setIdentifierError('');

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

    setIsInviting(true);

    try {
      const normalizedEmail = hasEmail ? email.toLowerCase().trim() : null;
      const e164Phone = hasPhone ? buildE164Phone(phoneCountry, phone) : null;

      if (hasPhone && !e164Phone) {
        toast.error('Could not determine calling code');
        setIsInviting(false);
        return;
      }

      // Dedupe check via edge function
      const dedupeBody: Record<string, any> = { dedupe_only: true };
      if (normalizedEmail) dedupeBody.email = normalizedEmail;
      if (e164Phone) dedupeBody.phone = e164Phone;

      const { data: checkResult } = await supabase.functions.invoke('check-invite', {
        body: dedupeBody,
      });

      if (checkResult?.error) {
        setIdentifierError(checkResult.error);
        setIsInviting(false);
        return;
      }

      // Create invite
      const insertData: Record<string, any> = {
        full_name: name.trim(),
        role: role as any,
        workshop_id: effectiveWorkshopId,
        invited_by: profile.id,
      };
      if (normalizedEmail) insertData.email = normalizedEmail;
      if (e164Phone) insertData.phone = e164Phone;

      const { error } = await supabase
        .from('user_invites')
        .insert(insertData as any);

      if (error) throw error;

      toast.success(`Invite sent to ${name.trim()}`);
      resetForm();
      onOpenChange(false);
      onInvited();
    } catch (error: any) {
      console.error('Error creating invite:', error);
      toast.error(error.message || 'Failed to send invite');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
        {step === 'workshop' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Select Workshop
              </DialogTitle>
              <DialogDescription>
                Choose the workshop to invite a member into
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workshops..."
                value={workshopSearch}
                onChange={(e) => setWorkshopSearch(e.target.value)}
                className="pl-10 pr-8 h-10"
              />
              {workshopSearch && (
                <button
                  type="button"
                  onClick={() => setWorkshopSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh]">
              {isLoadingWorkshops ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : filteredWorkshops.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {workshopSearch ? 'No matching workshops' : 'No workshops available'}
                </p>
              ) : (
                filteredWorkshops.map((w) => (
                  <Card
                    key={w.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors active:bg-accent"
                    onClick={() => {
                      setSelectedWorkshop(w);
                      setStep('form');
                    }}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{w.name}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[w.city, w.country].filter(Boolean).join(', ') || 'No location'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite Team Member
              </DialogTitle>
              <DialogDescription>
                {selectedWorkshop
                  ? `Invite a new user to ${selectedWorkshop.name}`
                  : 'Invite a new user to your workshop'}
              </DialogDescription>
            </DialogHeader>

            {requireWorkshopSelection && selectedWorkshop && (
              <button
                type="button"
                onClick={() => setStep('workshop')}
                className="flex items-center gap-1 text-sm text-primary hover:underline mb-1"
              >
                <ChevronLeft className="h-3 w-3" />
                Change workshop
              </button>
            )}

            <DialogBody className="space-y-4">
              {selectedWorkshop && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{selectedWorkshop.name}</span>
                </div>
              )}

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
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setIdentifierError(''); }}
                />
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <div className="flex gap-2">
                  <div className="w-[140px] shrink-0">
                    <Select value={phoneCountry} onValueChange={setPhoneCountry}>
                      <SelectTrigger className="bg-background w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {countries.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name} ({c.calling_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="712345678"
                      value={phone}
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
                At least one of email or phone is required. The user will activate their account via the New User flow.
              </p>

              <div className="space-y-2">
                <Label>Role <span className="text-destructive">*</span></Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'workshop_admin' | 'technician')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technician">Technician</SelectItem>
                    {allowAdminRole && (
                      <SelectItem value="workshop_admin">Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isInviting}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={isInviting}>
                {isInviting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Inviting...
                  </>
                ) : (
                  'Send Invite'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
