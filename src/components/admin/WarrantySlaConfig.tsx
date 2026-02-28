import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { buildBucketLabels } from '@/hooks/useSlaBuckets';

export function WarrantySlaConfig() {
  const [values, setValues] = useState<[string, string, string]>(['4', '12', '24']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings' as any)
          .select('value')
          .eq('key', 'warranty_sla_buckets_hours')
          .maybeSingle();
        if (data) {
          const parsed = JSON.parse((data as any).value);
          if (Array.isArray(parsed) && parsed.length === 3) {
            setValues([String(parsed[0]), String(parsed[1]), String(parsed[2])]);
          }
        }
      } catch (err) {
        console.error('Failed to load SLA config:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const validate = (): number[] | null => {
    const nums = values.map(v => parseInt(v, 10));
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

  const handleSave = async () => {
    const nums = validate();
    if (!nums) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings' as any)
        .update({ value: JSON.stringify(nums) } as any)
        .eq('key', 'warranty_sla_buckets_hours');
      if (error) throw error;
      toast.success('Warranty SLA buckets updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const previewLabels = (() => {
    const nums = values.map(v => parseInt(v, 10));
    if (nums.some(n => isNaN(n) || n <= 0)) return null;
    if (nums[0] >= nums[1] || nums[1] >= nums[2]) return null;
    return buildBucketLabels(nums);
  })();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Warranty SLA Buckets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Set the hour thresholds that define TAT buckets on the warranty approvals queue.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(['Bucket 1', 'Bucket 2', 'Bucket 3'] as const).map((label, i) => (
            <div key={i}>
              <Label className="text-[11px] text-muted-foreground">{label} (hours)</Label>
              <Input
                type="number"
                min={1}
                className="h-9 mt-1"
                value={values[i]}
                onChange={e => {
                  const next = [...values] as [string, string, string];
                  next[i] = e.target.value;
                  setValues(next);
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
        <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {isSaving ? 'Saving…' : 'Save SLA Buckets'}
        </Button>
      </CardContent>
    </Card>
  );
}
