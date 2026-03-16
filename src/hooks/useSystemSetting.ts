import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to read a boolean system_settings value.
 * If country is provided, reads from country_settings first, falls back to system_settings.
 * Returns { value, isLoading } — value defaults to `defaultValue` until loaded.
 */
export function useSystemSetting(key: string, defaultValue = true, country?: string | null) {
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let resolved = false;

        if (country) {
          const { data } = await supabase
            .from('country_settings' as any)
            .select('value')
            .eq('country_name', country)
            .eq('setting_key', key)
            .maybeSingle();

          if (!cancelled && data) {
            setValue((data as any).value === 'true');
            resolved = true;
          }
        }

        if (!resolved) {
          const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

          if (!cancelled && data) {
            setValue(data.value === 'true');
          }
        }
      } catch (err) {
        console.error(`Failed to read system setting ${key}:`, err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key, country]);

  return { value, isLoading };
}
