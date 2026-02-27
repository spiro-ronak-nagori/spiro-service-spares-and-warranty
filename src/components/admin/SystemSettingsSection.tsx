import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export function SystemSettingsSection() {
  const [smsTestMode, setSmsTestMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchSetting();
  }, []);

  const fetchSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings' as any)
        .select('value')
        .eq('key', 'ENABLE_SMS_TEST_MODE')
        .maybeSingle();

      if (error) throw error;
      setSmsTestMode((data as any)?.value === 'true');
    } catch (err) {
      console.error('Failed to fetch system setting:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    const prev = smsTestMode;
    setSmsTestMode(checked); // optimistic

    try {
      const { error } = await supabase
        .from('system_settings' as any)
        .update({ value: String(checked) } as any)
        .eq('key', 'ENABLE_SMS_TEST_MODE');

      if (error) throw error;
      toast.success(`SMS Test Mode ${checked ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      console.error('Failed to update setting:', err);
      setSmsTestMode(prev); // rollback
      toast.error(err.message || 'Failed to update setting');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <Label htmlFor="sms-test-mode" className="text-sm font-medium cursor-pointer">
                SMS Test Mode
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, OTP will be shown in a UI popup and SMS will <strong>not</strong> be sent.
                When disabled, real SMS will be sent via Africa's Talking.
              </p>
            </div>
          </div>
          <Switch
            id="sms-test-mode"
            checked={smsTestMode}
            onCheckedChange={handleToggle}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
}
