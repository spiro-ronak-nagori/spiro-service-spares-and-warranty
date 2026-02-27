import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CountryMaster {
  id: string;
  name: string;
  iso2: string;
  calling_code: string;
  is_active: boolean;
  sort_order: number;
}

let cachedCountries: CountryMaster[] | null = null;

export function useCountries() {
  const [countries, setCountries] = useState<CountryMaster[]>(cachedCountries || []);
  const [isLoading, setIsLoading] = useState(!cachedCountries);

  useEffect(() => {
    if (cachedCountries) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('countries_master' as any)
          .select('*')
          .eq('is_active', true)
          .order('sort_order');
        if (error) throw error;
        const result = (data || []) as unknown as CountryMaster[];
        cachedCountries = result;
        setCountries(result);
      } catch (err) {
        console.error('Failed to fetch countries:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const getCallingCode = (countryName: string): string | null => {
    return countries.find(c => c.name === countryName)?.calling_code || null;
  };

  const getCountryNames = (): string[] => countries.map(c => c.name);

  const buildE164Phone = (countryName: string, localNumber: string): string | null => {
    const code = getCallingCode(countryName);
    if (!code) return null;
    const digits = localNumber.replace(/\D/g, '');
    if (!digits) return null;
    return code + digits;
  };

  return { countries, isLoading, getCallingCode, getCountryNames, buildE164Phone };
}
