import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCountries } from '@/hooks/useCountries';
import { useAllCountrySettings } from '@/hooks/useCountrySetting';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Info, Send, UserCheck, MessageSquare, Camera, ClipboardList,
  ListTree, ClipboardCheck, Wrench, Clock, Save, Globe,
} from 'lucide-react';
import { buildBucketLabels } from '@/hooks/useSlaBuckets';
import { toast } from 'sonner';

interface SettingItem {
  key: string;
  label: string;
  description: string;
  tooltip: string;
  icon: React.ElementType;
}

const TOGGLE_SETTINGS: SettingItem[] = [
  {
    key: 'ENABLE_SMS_SENDING',
    label: 'Enable SMS Sending',
    description: 'Controls whether real SMS are sent. Disable to prevent SMS costs.',
    tooltip: 'When enabled, SMS messages (OTP, status updates, feedback links) are sent via Africa\'s Talking. When disabled, no SMS is sent but OTP test mode popups still work if SMS Test Mode is also enabled.',
    icon: Send,
  },
  {
    key: 'ENABLE_ALTERNATE_PHONE_NUMBER',
    label: 'Alternate Phone Number',
    description: 'Allow technicians to choose a Rider contact for OTP & updates per job card.',
    tooltip: 'When enabled, technicians can choose a Rider contact for OTP & updates per job card. When disabled, OTP & updates always go to the registered owner phone.',
    icon: UserCheck,
  },
  {
    key: 'ENABLE_SMS_TEST_MODE',
    label: 'SMS Test Mode',
    description: 'OTP shown in UI popup, not sent via SMS. Other notifications still sent.',
    tooltip: 'When enabled, OTP SMS will not be sent and OTP will be shown on screen. Other SMS notifications (delivery status, feedback links) will still be sent.',
    icon: MessageSquare,
  },
  {
    key: 'ENABLE_IMAGE_OCR',
    label: 'Enable Image OCR',
    description: 'Controls Scan Plate and Gemini Vision for odometer/SOC images.',
    tooltip: 'When disabled, the "Scan Plate" option is hidden and Gemini Vision OCR is not used for registration plates, odometer, or SOC images. Image capture for odometer and SOC is still available for record-keeping.',
    icon: Camera,
  },
  {
    key: 'ENABLE_FEEDBACK_FORM',
    label: 'Enable Feedback Form',
    description: 'Controls feedback link generation on delivery.',
    tooltip: 'When disabled, no feedback link is generated when a job card moves to DELIVERED, and no feedback link is included in the delivery SMS.',
    icon: ClipboardList,
  },
  {
    key: 'ENABLE_SPARES_FLOW',
    label: 'Enable Spares Flow',
    description: 'Controls the spare parts capture during service workflow.',
    tooltip: 'When enabled, technicians are prompted to record spare parts used when starting work, and work completion validates spares requirements. When disabled, spares UI is hidden.',
    icon: ListTree,
  },
  {
    key: 'ENABLE_WARRANTY_FLOW',
    label: 'Enable Warranty Flow',
    description: 'Controls warranty/goodwill claim types and old-part evidence.',
    tooltip: 'When enabled, claim types include WARRANTY and GOODWILL with old-part evidence photo requirements. When disabled, all spares default to USER_PAID only.',
    icon: ListTree,
  },
  {
    key: 'ENABLE_VEHICLE_CHECKLIST',
    label: 'Enable Vehicle Checklist',
    description: 'Mandatory intake checklist after inwarding, before Start Work.',
    tooltip: 'When enabled, technicians must complete a configured vehicle checklist after inwarding before they can proceed to Start Work. When disabled, the flow works as usual with no checklist gate.',
    icon: ClipboardCheck,
  },
  {
    key: 'ENABLE_MECHANIC_NAME',
    label: 'Mechanic Name Capture',
    description: 'Require mechanic name entry on Start Work.',
    tooltip: 'When enabled, the technician must enter the assigned mechanic name when starting work. The name is shown on the job card and editable until work is completed.',
    icon: Wrench,
  },
];

export default function ManageTogglesPage() {
  const { profile } = useAuth();
  const { countries, isLoading: countriesLoading } = useCountries();
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const { settings, isLoading: settingsLoading, setSettings } = useAllCountrySettings(selectedCountry || null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  // SLA state
  const [slaValues, setSlaValues] = useState<[string, string, string]>(['4', '12', '24']);
  const [isSavingSla, setIsSavingSla] = useState(false);

  // Warranty OFF confirmation
  const [showWarrantyOffConfirm, setShowWarrantyOffConfirm] = useState(false);
  const [warrantyOffLoading, setWarrantyOffLoading] = useState(false);

  const isSystemAdmin = profile?.role === 'system_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const hasAccess = isSystemAdmin || isSuperAdmin;

  // Sync SLA values when settings load
  useEffect(() => {
    const slaStr = settings['warranty_sla_buckets_hours'];
    if (slaStr) {
      try {
        const parsed = JSON.parse(slaStr);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setSlaValues([String(parsed[0]), String(parsed[1]), String(parsed[2])]);
        }
      } catch { /* keep defaults */ }
    } else {
      setSlaValues(['4', '12', '24']);
    }
  }, [settings]);

  const handleToggle = async (key: string, checked: boolean) => {
    if (!selectedCountry) return;

    // Intercept warranty flow OFF
    if (key === 'ENABLE_WARRANTY_FLOW' && !checked && settings[key] === 'true') {
      setShowWarrantyOffConfirm(true);
      return;
    }

    await applyToggle(key, checked);
  };

  const applyToggle = async (key: string, checked: boolean) => {
    if (!selectedCountry) return;
    setUpdatingKey(key);
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: String(checked) }));
    try {
      // Upsert into country_settings
      const { data: existing } = await supabase
        .from('country_settings' as any)
        .select('id')
        .eq('country_name', selectedCountry)
        .eq('setting_key', key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('country_settings' as any)
          .update({ value: String(checked) } as any)
          .eq('country_name', selectedCountry)
          .eq('setting_key', key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('country_settings' as any)
          .insert({ country_name: selectedCountry, setting_key: key, value: String(checked) } as any);
        if (error) throw error;
      }

      const label = TOGGLE_SETTINGS.find((s) => s.key === key)?.label || key;
      toast.success(`${label} ${checked ? 'enabled' : 'disabled'} for ${selectedCountry}`);
    } catch (err: any) {
      setSettings((s) => ({ ...s, [key]: prev || 'false' }));
      toast.error(err.message || 'Failed to update setting');
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleConfirmWarrantyOff = async () => {
    if (!selectedCountry) return;
    setWarrantyOffLoading(true);
    try {
      // Find workshops in this country
      const { data: workshops } = await supabase
        .from('workshops')
        .select('id')
        .eq('country', selectedCountry);
      const workshopIds = (workshops || []).map((w: any) => w.id);

      if (workshopIds.length > 0) {
        // Get job cards for those workshops
        const { data: jobCards } = await supabase
          .from('job_cards')
          .select('id')
          .in('workshop_id', workshopIds);
        const jcIds = (jobCards || []).map((j: any) => j.id);

        if (jcIds.length > 0) {
          await supabase
            .from('job_card_spares' as any)
            .update({
              claim_type: 'USER_PAID',
              old_part_serial_number: null,
              claim_comment: null,
            } as any)
            .in('claim_type', ['WARRANTY', 'GOODWILL'])
            .eq('approval_state', 'DRAFT')
            .in('job_card_id', jcIds);
        }
      }

      await applyToggle('ENABLE_WARRANTY_FLOW', false);
      toast.success('Draft warranty/goodwill claims converted to User Paid');
    } catch (err: any) {
      console.error('Failed to convert draft claims:', err);
      toast.error(err.message || 'Failed to disable warranty flow');
    } finally {
      setWarrantyOffLoading(false);
      setShowWarrantyOffConfirm(false);
    }
  };

  // SLA validation & save
  const validateSla = (): number[] | null => {
    const nums = slaValues.map(v => parseInt(v, 10));
    for (const n of nums) {
      if (!Number.isInteger(n) || n <= 0) {
        toast.error('All values must be positive integers');
        return null;
      }
    }
    if (nums[0] >= nums[1] || nums[1] >= nums[2]) {
      toast.error('Values must be strictly increasing');
      return null;
    }
    return nums;
  };

  const handleSaveSla = async () => {
    if (!selectedCountry) return;
    const nums = validateSla();
    if (!nums) return;
    setIsSavingSla(true);
    try {
      const val = JSON.stringify(nums);
      const { data: existing } = await supabase
        .from('country_settings' as any)
        .select('id')
        .eq('country_name', selectedCountry)
        .eq('setting_key', 'warranty_sla_buckets_hours')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('country_settings' as any)
          .update({ value: val } as any)
          .eq('country_name', selectedCountry)
          .eq('setting_key', 'warranty_sla_buckets_hours');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('country_settings' as any)
          .insert({ country_name: selectedCountry, setting_key: 'warranty_sla_buckets_hours', value: val } as any);
        if (error) throw error;
      }
      toast.success(`Warranty SLA buckets updated for ${selectedCountry}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSavingSla(false);
    }
  };

  const previewLabels = (() => {
    const nums = slaValues.map(v => parseInt(v, 10));
    if (nums.some(n => isNaN(n) || n <= 0)) return null;
    if (nums[0] >= nums[1] || nums[1] >= nums[2]) return null;
    return buildBucketLabels(nums);
  })();

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console/system-config" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Manage Toggles" showBack backTo="/console/system-config" />

      {/* Sticky country selector */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a country" />
            </SelectTrigger>
            <SelectContent>
              {countriesLoading ? (
                <div className="p-2 text-xs text-muted-foreground">Loading…</div>
              ) : (
                countries.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!selectedCountry ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Select a country to configure feature toggles and SLA settings.</p>
            </CardContent>
          </Card>
        ) : settingsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-64" /></CardContent></Card>
          ))
        ) : (
          <>
            {/* Toggle Settings */}
            {TOGGLE_SETTINGS.map((item) => (
              <Card key={item.key}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <item.icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={item.key} className="text-sm font-medium cursor-pointer">
                            {item.label}
                          </Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px]">
                              <p className="text-xs">{item.tooltip}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                    <Switch
                      id={item.key}
                      checked={settings[item.key] === 'true'}
                      onCheckedChange={(checked) => handleToggle(item.key, checked)}
                      disabled={updatingKey === item.key}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Warranty SLA Buckets */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Warranty SLA Buckets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Set the hour thresholds that define TAT buckets on the warranty approvals queue for {selectedCountry}.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Bucket 1', 'Bucket 2', 'Bucket 3'] as const).map((label, i) => (
                    <div key={i}>
                      <Label className="text-[11px] text-muted-foreground">{label} (hours)</Label>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 mt-1"
                        value={slaValues[i]}
                        onChange={e => {
                          const next = [...slaValues] as [string, string, string];
                          next[i] = e.target.value;
                          setSlaValues(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
                {previewLabels && (
                  <div className="flex gap-1.5 flex-wrap">
                    {previewLabels.map(label => (
                      <span key={label} className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                <Button size="sm" onClick={handleSaveSla} disabled={isSavingSla} className="w-full">
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSavingSla ? 'Saving…' : 'Save SLA Buckets'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Warranty OFF confirmation */}
      <ConfirmationDialog
        open={showWarrantyOffConfirm}
        onOpenChange={setShowWarrantyOffConfirm}
        title="Disable Warranty Flow?"
        description={`Draft warranty/goodwill entries in ${selectedCountry} will be converted to User Paid. Submitted claims will remain unchanged. Continue?`}
        confirmLabel="Disable"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={warrantyOffLoading}
        onConfirm={handleConfirmWarrantyOff}
      />
    </AppLayout>
  );
}
