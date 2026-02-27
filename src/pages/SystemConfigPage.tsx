import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, Camera, ClipboardList, ListTree, Info, ChevronRight, UserCheck, Send, Package } from 'lucide-react';
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
];

export default function SystemConfigPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  // Only system_admin can access the config toggles page
  const isSystemAdmin = profile?.role === 'system_admin';

  useEffect(() => {
    if (isSystemAdmin) fetchSettings();
  }, [isSystemAdmin]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings' as any)
        .select('key, value');
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data as any[] || []).forEach((row: any) => {
        map[row.key] = row.value === 'true';
      });
      setSettings(map);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (key: string, checked: boolean) => {
    setUpdatingKey(key);
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: checked }));
    try {
      const { error } = await supabase
        .from('system_settings' as any)
        .update({ value: String(checked) } as any)
        .eq('key', key);
      if (error) throw error;
      const label = TOGGLE_SETTINGS.find((s) => s.key === key)?.label || key;
      toast.success(`${label} ${checked ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      setSettings((s) => ({ ...s, [key]: prev }));
      toast.error(err.message || 'Failed to update setting');
    } finally {
      setUpdatingKey(null);
    }
  };

  if (!isSystemAdmin) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" showBack backTo="/console" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">System Admin access required.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="System Configuration" showBack backTo="/console" />
      <div className="p-4 space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
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
                      checked={settings[item.key] ?? false}
                      onCheckedChange={(checked) => handleToggle(item.key, checked)}
                      disabled={updatingKey === item.key}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Navigation Cards */}
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/console/service-categories')}>
              <CardContent className="p-4 flex items-center gap-4">
                <ListTree className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium">Manage Service Categories</h3>
                  <p className="text-xs text-muted-foreground">Add, edit, and remove service categories and issues</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/console/feedback-editor')}>
              <CardContent className="p-4 flex items-center gap-4">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium">Manage Feedback Form</h3>
                  <p className="text-xs text-muted-foreground">Edit questions, types, and ordering</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate('/console/spare-parts')}>
              <CardContent className="p-4 flex items-center gap-4">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium">Manage Spare Parts</h3>
                  <p className="text-xs text-muted-foreground">Spare parts master list and vehicle model mappings</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
