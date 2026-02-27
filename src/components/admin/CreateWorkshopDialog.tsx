import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Building2, User, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCountries } from '@/hooks/useCountries';
import { getCitiesForCountry, getProvinceForCity } from '@/lib/location-data';

interface CreateWorkshopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateWorkshopDialog({ open, onOpenChange, onCreated }: CreateWorkshopDialogProps) {
  const { profile } = useAuth();
  const { countries, getCallingCode, buildE164Phone } = useCountries();
  const [isCreating, setIsCreating] = useState(false);
  const isCountryAdmin = profile?.role === 'country_admin';

  // Workshop fields
  const [workshopName, setWorkshopName] = useState('');
  const [workshopType, setWorkshopType] = useState<'COCO' | 'FOFO'>('COCO');
  const [workshopGrade, setWorkshopGrade] = useState<'A' | 'B' | 'C'>('B');
  const [mapLink, setMapLink] = useState('');
  const [country, setCountry] = useState(isCountryAdmin && profile?.country ? profile.country : '');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [nameError, setNameError] = useState('');

  // Admin fields
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [identifierError, setIdentifierError] = useState('');

  const citiesForCountry = getCitiesForCountry(country);
  const callingCode = getCallingCode(country);
  const countryNames = countries.map(c => c.name);

  const handleCountryChange = (value: string) => {
    setCountry(value);
    setCity('');
    setProvince('');
    setAdminPhone(''); // reset phone when country changes
  };

  const handleCityChange = (value: string) => {
    setCity(value);
    setProvince(getProvinceForCity(country, value));
  };

  const resetForm = () => {
    setWorkshopName('');
    setWorkshopType('COCO');
    setWorkshopGrade('B');
    setMapLink('');
    setCountry(isCountryAdmin && profile?.country ? profile.country : '');
    setCity('');
    setProvince('');
    setAdminName('');
    setAdminEmail('');
    setAdminPhone('');
    setNameError('');
    setIdentifierError('');
  };

  const handleCreate = async () => {
    if (!profile) return;
    setNameError('');
    setIdentifierError('');

    if (!workshopName.trim()) { toast.error('Workshop name is required'); return; }
    if (!mapLink.trim()) { toast.error('Google Maps link is required'); return; }
    if (!country) { toast.error('Country is required'); return; }
    if (!city) { toast.error('City is required'); return; }
    if (!adminName.trim()) { toast.error('Admin name is required'); return; }

    const hasEmail = !!adminEmail.trim();
    const hasPhone = !!adminPhone.trim();

    if (!hasEmail && !hasPhone) {
      toast.error('At least one of admin email or phone is required');
      return;
    }

    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(adminEmail)) { toast.error('Please enter a valid email address'); return; }
    }

    if (hasPhone && adminPhone.replace(/\D/g, '').length !== 9) {
      toast.error('Phone must be exactly 9 digits');
      return;
    }

    setIsCreating(true);

    try {
      const normalizedEmail = hasEmail ? adminEmail.toLowerCase().trim() : null;
      const e164Phone = hasPhone ? buildE164Phone(country, adminPhone) : null;

      if (hasPhone && !e164Phone) {
        toast.error('Could not determine calling code for selected country');
        setIsCreating(false);
        return;
      }

      // ── Dedupe check (case-insensitive) ──
      const { data: existingWorkshop } = await supabase
        .from('workshops')
        .select('id')
        .ilike('name', workshopName.trim())
        .maybeSingle();

      if (existingWorkshop) {
        setNameError('A workshop with this name already exists');
        setIsCreating(false);
        return;
      }

      // Check invite availability via edge function
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

      // Create workshop
      const { data: workshopData, error: workshopError } = await supabase
        .from('workshops')
        .insert({
          name: workshopName.trim(),
          type: workshopType,
          grade: workshopGrade,
          map_link: mapLink.trim(),
          province: province,
          city: city,
          country: country,
        })
        .select()
        .single();

      if (workshopError) throw workshopError;

      // Create admin invite with email and/or phone
      const inviteData: Record<string, any> = {
        full_name: adminName.trim(),
        role: 'workshop_admin' as any,
        workshop_id: workshopData.id,
        invited_by: profile.id,
      };
      if (normalizedEmail) inviteData.email = normalizedEmail;
      if (e164Phone) inviteData.phone = e164Phone;

      const { error: inviteError } = await supabase
        .from('user_invites')
        .insert(inviteData as any);

      if (inviteError) throw inviteError;

      toast.success('Workshop and admin invite created successfully');
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      console.error('Error creating workshop:', error);
      toast.error(error.message || 'Failed to create workshop');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Create Workshop
          </DialogTitle>
          <DialogDescription>
            Create a new workshop and assign an admin
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workshop Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Workshop Details</h4>

            <div className="space-y-2">
              <Label>Workshop Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., Spiro Lagos Central"
                value={workshopName}
                onChange={(e) => { setWorkshopName(e.target.value); setNameError(''); }}
              />
              {nameError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {nameError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type <span className="text-destructive">*</span></Label>
                <Select value={workshopType} onValueChange={(v) => setWorkshopType(v as 'COCO' | 'FOFO')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COCO">COCO</SelectItem>
                    <SelectItem value="FOFO">FOFO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grade <span className="text-destructive">*</span></Label>
                <Select value={workshopGrade} onValueChange={(v) => setWorkshopGrade(v as 'A' | 'B' | 'C')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Grade A</SelectItem>
                    <SelectItem value="B">Grade B</SelectItem>
                    <SelectItem value="C">Grade C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Google Maps Link <span className="text-destructive">*</span></Label>
              <Input
                placeholder="https://maps.google.com/..."
                value={mapLink}
                onChange={(e) => setMapLink(e.target.value)}
              />
            </div>

            {/* Country dropdown */}
            <div className="space-y-2">
              <Label>Country <span className="text-destructive">*</span></Label>
              <Select value={country} onValueChange={handleCountryChange} disabled={isCountryAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {(isCountryAdmin && profile?.country ? [profile.country] : countryNames).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* City dropdown — enabled after country */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City <span className="text-destructive">*</span></Label>
                <Select value={city} onValueChange={handleCityChange} disabled={!country}>
                  <SelectTrigger>
                    <SelectValue placeholder={country ? 'Select city' : 'Select country first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {citiesForCountry.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Province</Label>
                <Input value={province} readOnly className="bg-muted" placeholder="Auto-filled" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Admin Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Workshop Admin
            </h4>

            <div className="space-y-2">
              <Label>Admin Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Full name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Admin Email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={adminEmail}
                onChange={(e) => { setAdminEmail(e.target.value); setIdentifierError(''); }}
              />
            </div>

            <div className="space-y-2">
              <Label>Admin Phone</Label>
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
                    value={adminPhone}
                    disabled={!country}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                      setAdminPhone(digits);
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
              Enter email or phone. At least one is required. Phone country code is locked to the workshop's country.
            </p>
          </div>
        </div>

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
              'Create Workshop'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
