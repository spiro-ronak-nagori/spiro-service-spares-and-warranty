import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to read a boolean system_settings value.
 * Returns { value, isLoading } — value defaults to `defaultValue` until loaded.
 */
export function useSystemSetting(key: string, defaultValue = true) {
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();

        if (!cancelled && data) {
          setValue(data.value === 'true');
        }
      } catch (err) {
        console.error(`Failed to read system setting ${key}:`, err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  return { value, isLoading };
}
