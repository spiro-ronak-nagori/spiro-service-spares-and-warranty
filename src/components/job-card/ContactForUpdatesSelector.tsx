import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Phone, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useCountries, CountryMaster } from '@/hooks/useCountries';

// Keep PHONE_COUNTRIES export for backward compat (used by OtpVerificationDialog, etc.)
// This will use the static fallback; callers that need live data should use useCountries directly.
export const PHONE_COUNTRIES = [
  { name: 'Kenya', code: '+254', example: '712345678' },
  { name: 'Uganda', code: '+256', example: '712345678' },
  { name: 'Rwanda', code: '+250', example: '788123456' },
] as const;

/** Parse E.164 phone (e.g., +254876545678) into country code and local number */
export function parseE164Phone(phone: string): { countryCode: string; localNumber: string; countryName: string } {
  if (!phone) return { countryCode: '', localNumber: '', countryName: '' };
  
  // Try to match against known country codes
  const phoneStr = phone.startsWith('+') ? phone : '+' + phone;
  
  for (const country of PHONE_COUNTRIES) {
    if (phoneStr.startsWith(country.code)) {
      const localNum = phoneStr.slice(country.code.length);
      return { countryCode: country.name, localNumber: localNum, countryName: country.name };
    }
  }
  
  // If no match, return empty
  return { countryCode: '', localNumber: '', countryName: '' };
}

export const RIDER_REASONS = [
  { value: 'RENTED', label: 'Rented' },
  { value: 'LEASED', label: 'Leased' },
  { value: 'COMPANY_RIDER', label: 'Company Rider' },
  { value: 'FRIEND_OR_FAMILY', label: 'Friend or Family' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** Mask phone for OTP confirmation screens only */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '——';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '******' + digits.slice(-4);
}

/** Format full phone for display in UI (with country code if available) */
function formatFullPhone(phone: string | null | undefined): string {
  if (!phone) return '——';
  return phone;
}

export interface ContactData {
  contact_for_updates: 'OWNER' | 'RIDER';
  rider_name: string;
  rider_phone: string;
  rider_phone_country: string;
  rider_reason: string;
  rider_reason_notes: string;
}

interface ContactForUpdatesSelectorProps {
  ownerPhone: string | null | undefined;
  ownerName: string | null | undefined;
  workshopCountry: string | null | undefined;
  value: ContactData;
  onChange: (data: ContactData) => void;
  disabled?: boolean;
  /** True when vehicle is new / no master owner exists */
  isNewVehicle?: boolean;
}

export function ContactForUpdatesSelector({
  ownerPhone,
  ownerName,
  workshopCountry,
  value,
  onChange,
  disabled = false,
  isNewVehicle = false,
}: ContactForUpdatesSelectorProps) {
  const [expanded, setExpanded] = useState(value.contact_for_updates === 'RIDER');
  const { countries } = useCountries();

  const defaultCountry = countries.find(
    (c) => c.name.toLowerCase() === workshopCountry?.toLowerCase()
  )?.name || '';

  const handleContactChange = (type: 'OWNER' | 'RIDER') => {
    onChange({ ...value, contact_for_updates: type });
  };

  const update = (partial: Partial<ContactData>) => {
    onChange({ ...value, ...partial });
  };

  // Labels depend on whether vehicle is new or existing
  const ownerLabel = isNewVehicle
    ? 'Use customer phone'
    : `Registered Owner (${ownerName || 'Unknown'})`;
  const riderLabel = isNewVehicle
    ? 'Use a different rider phone'
    : 'Rider (different person)';

  return (
    <div className="space-y-2 mt-3">
      {/* Collapsible trigger */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        disabled={disabled}
      >
        Is the rider not the owner?
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
          <div>
            <Label className="text-sm font-medium">Alternate contact details</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Status updates and OTP will be sent to this number.
            </p>
          </div>

          <RadioGroup
            value={value.contact_for_updates}
            onValueChange={(v) => handleContactChange(v as 'OWNER' | 'RIDER')}
            disabled={disabled}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="OWNER" id="contact-owner" className="mt-0.5" />
              <Label htmlFor="contact-owner" className="cursor-pointer text-sm leading-tight">
                <span>{ownerLabel}</span>
                {ownerPhone && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {formatFullPhone(ownerPhone)}
                  </span>
                )}
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="RIDER" id="contact-rider" className="mt-0.5" />
              <Label htmlFor="contact-rider" className="cursor-pointer text-sm">
                {riderLabel}
              </Label>
            </div>
          </RadioGroup>

          {value.contact_for_updates === 'RIDER' && (
            <div className="space-y-3 pl-6 border-l-2 border-primary/20">
              <div className="space-y-2">
                <Label>Rider Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Full name"
                    value={value.rider_name}
                    onChange={(e) => update({ rider_name: e.target.value })}
                    className="pl-10"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rider Phone <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <div className="w-[140px] shrink-0">
                    <Select
                      value={value.rider_phone_country || defaultCountry}
                      onValueChange={(val) => update({ rider_phone_country: val })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="bg-background w-full">
                        <SelectValue placeholder="Country" />
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
                       value={value.rider_phone}
                       disabled={disabled}
                       onChange={(e) => {
                         const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                         update({ rider_phone: digits });
                       }}
                       className="w-full"
                       maxLength={9}
                     />
                   </div>
                </div>
                {value.rider_phone.length > 0 && value.rider_phone.length !== 9 && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Phone must be exactly 9 digits ({value.rider_phone.length}/9)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Reason <span className="text-destructive">*</span></Label>
                <Select
                  value={value.rider_reason}
                  onValueChange={(val) => update({ rider_reason: val })}
                  disabled={disabled}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Why is rider different?" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {RIDER_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {value.rider_reason === 'OTHER' && (
                <div className="space-y-2">
                  <Label>Other reason details</Label>
                  <Input
                    placeholder="Specify reason..."
                    value={value.rider_reason_notes}
                    onChange={(e) => update({ rider_reason_notes: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
