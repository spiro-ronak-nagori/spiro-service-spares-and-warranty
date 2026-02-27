import { useState, useEffect } from 'react';
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
import { Loader2, Pencil, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Workshop } from '@/types';
import { useCountries } from '@/hooks/useCountries';
import { getCitiesForCountry, getProvinceForCity, isCityInCountry } from '@/lib/location-data';

interface EditWorkshopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workshop: Workshop;
  onUpdated: () => void;
}

export function EditWorkshopDialog({ open, onOpenChange, workshop, onUpdated }: EditWorkshopDialogProps) {
  const { profile } = useAuth();
  const { countries } = useCountries();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'COCO' | 'FOFO'>('COCO');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('B');
  const [mapLink, setMapLink] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [nameError, setNameError] = useState('');

  const isCountryAdmin = profile?.role === 'country_admin';
  const citiesForCountry = getCitiesForCountry(country);
  const countryNames = countries.map(c => c.name);

  useEffect(() => {
    if (open && workshop) {
      setName(workshop.name);
      setType(workshop.type);
      setGrade(workshop.grade);
      setMapLink(workshop.map_link || '');
      setCountry(workshop.country || '');
      setCity(workshop.city || '');
      setProvince(workshop.province || '');
      setNameError('');
    }
  }, [open, workshop]);

  const handleCountryChange = (value: string) => {
    setCountry(value);
    setCity('');
    setProvince('');
  };

  const handleCityChange = (value: string) => {
    setCity(value);
    setProvince(getProvinceForCity(country, value));
  };

  const handleSave = async () => {
    setNameError('');

    if (!name.trim()) { toast.error('Workshop name is required'); return; }
    if (!mapLink.trim()) { toast.error('Google Maps link is required'); return; }
    if (!country) { toast.error('Country is required'); return; }
    if (!city) { toast.error('City is required'); return; }

    // Integrity check: city must belong to selected country
    if (!isCityInCountry(country, city)) {
      toast.error('Selected city does not belong to the selected country');
      return;
    }

    // Province must match
    const expectedProvince = getProvinceForCity(country, city);
    if (province !== expectedProvince) {
      setProvince(expectedProvince); // auto-correct silently
    }

    setIsSaving(true);
    try {
      // Dedupe check — exclude current workshop
      const { data: existingWorkshop } = await supabase
        .from('workshops')
        .select('id')
        .ilike('name', name.trim())
        .neq('id', workshop.id)
        .maybeSingle();

      if (existingWorkshop) {
        setNameError('A workshop with this name already exists');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('workshops')
        .update({
          name: name.trim(),
          type,
          grade,
          map_link: mapLink.trim(),
          province: expectedProvince || province,
          city,
          country,
        })
        .eq('id', workshop.id);

      if (error) throw error;

      toast.success('Workshop updated');
      onOpenChange(false);
      onUpdated();
    } catch (error: any) {
      console.error('Error updating workshop:', error);
      toast.error(error.message || 'Failed to update workshop');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Workshop
          </DialogTitle>
          <DialogDescription>Update workshop details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workshop Name */}
          <div className="space-y-2">
            <Label>Workshop Name <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g., Spiro Lagos Central"
            />
            {nameError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {nameError}
              </p>
            )}
          </div>

          {/* Type & Grade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={(v) => setType(v as 'COCO' | 'FOFO')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COCO">COCO</SelectItem>
                  <SelectItem value="FOFO">FOFO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grade <span className="text-destructive">*</span></Label>
              <Select value={grade} onValueChange={(v) => setGrade(v as 'A' | 'B' | 'C')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Grade A</SelectItem>
                  <SelectItem value="B">Grade B</SelectItem>
                  <SelectItem value="C">Grade C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Maps Link */}
          <div className="space-y-2">
            <Label>Google Maps Link <span className="text-destructive">*</span></Label>
            <Input
              placeholder="https://maps.google.com/..."
              value={mapLink}
              onChange={(e) => setMapLink(e.target.value)}
            />
          </div>

          {/* Country dropdown — locked for Country Admin */}
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

          {/* City dropdown + Province auto-derived */}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
