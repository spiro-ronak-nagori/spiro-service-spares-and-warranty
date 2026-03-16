import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Read a setting from country_settings, falling back to system_settings.
 */
export function useCountrySetting(key: string, country: string | null | undefined, defaultValue = 'false') {
  const [value, setValue] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        if (country) {
          const { data } = await supabase
            .from('country_settings' as any)
            .select('value')
            .eq('country_name', country)
            .eq('setting_key', key)
            .maybeSingle();
          if (!cancelled && data) {
            setValue((data as any).value);
            setIsLoading(false);
            return;
          }
        }
        // Fallback to global system_settings
        const { data: globalData } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        if (!cancelled && globalData) {
          setValue(globalData.value);
        }
      } catch (err) {
        console.error(`Failed to read setting ${key}:`, err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key, country]);

  return { value, isLoading };
}

/**
 * Boolean convenience wrapper for useCountrySetting.
 */
export function useCountryBoolSetting(key: string, country: string | null | undefined, defaultValue = false) {
  const { value, isLoading } = useCountrySetting(key, country, String(defaultValue));
  return { value: value === 'true', isLoading };
}

/**
 * Load all settings for a given country from country_settings table.
 */
export function useAllCountrySettings(country: string | null | undefined) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!country) {
      setSettings({});
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('country_settings' as any)
          .select('setting_key, value')
          .eq('country_name', country);
        if (error) throw error;
        if (!cancelled) {
          const map: Record<string, string> = {};
          ((data as any[]) || []).forEach((row: any) => {
            map[row.setting_key] = row.value;
          });
          setSettings(map);
        }
      } catch (err) {
        console.error('Failed to load country settings:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [country]);

  return { settings, isLoading, setSettings };
}
