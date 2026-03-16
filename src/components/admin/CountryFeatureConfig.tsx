import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useCountries } from '@/hooks/useCountries';

interface CountryFeatureConfigProps {
  settingKey: string;
  label: string;
  description: string;
  tooltip: string;
  icon: React.ElementType;
}

export function CountryFeatureConfig({
  settingKey,
  label,
  description,
  tooltip,
  icon: Icon,
}: CountryFeatureConfigProps) {
  const { countries, isLoading: countriesLoading } = useCountries();
  const [enabledCountries, setEnabledCountries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', settingKey)
          .maybeSingle();
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            setEnabledCountries(Array.isArray(parsed) ? parsed : []);
          } catch {
            setEnabledCountries([]);
          }
        }
      } catch (err) {
        console.error(`Failed to load ${settingKey}:`, err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [settingKey]);

  const handleToggleCountry = (countryName: string) => {
    setEnabledCountries((prev) =>
      prev.includes(countryName)
        ? prev.filter((c) => c !== countryName)
        : [...prev, countryName]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings' as any)
        .update({ value: JSON.stringify(enabledCountries) } as any)
        .eq('key', settingKey);
      if (error) throw error;
      toast.success(`${label} updated`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || countriesLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
    );
  }

  const enabledCount = enabledCountries.length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium">{label}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  <p className="text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {enabledCount === 0
                ? 'Disabled for all countries'
                : `Enabled for ${enabledCount} ${enabledCount === 1 ? 'country' : 'countries'}`}
            </p>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs mt-2 gap-1 px-2"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Collapse' : 'Configure Countries'}
            </Button>

            {expanded && (
              <div className="mt-3 space-y-2">
                {countries.map((country) => (
                  <div key={country.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`${settingKey}-${country.id}`}
                      checked={enabledCountries.includes(country.name)}
                      onCheckedChange={() => handleToggleCountry(country.name)}
                    />
                    <Label
                      htmlFor={`${settingKey}-${country.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {country.name}
                    </Label>
                  </div>
                ))}
                <Button
                  size="sm"
                  className="mt-2 h-8"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
