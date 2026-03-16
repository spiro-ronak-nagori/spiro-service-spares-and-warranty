import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reads a system_settings key that stores a JSON array of country names.
 * Returns whether a given country is in the enabled list.
 */
export function useCountryFeatureSetting(key: string) {
  const [countries, setCountries] = useState<string[]>([]);
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
        if (!cancelled && data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            setCountries(Array.isArray(parsed) ? parsed : []);
          } catch {
            setCountries([]);
          }
        }
      } catch (err) {
        console.error(`Failed to read ${key}:`, err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const isEnabledForCountry = (country: string | null | undefined): boolean => {
    if (!country || countries.length === 0) return false;
    return countries.includes(country);
  };

  return { countries, isLoading, isEnabledForCountry };
}
