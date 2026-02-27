import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that fetches service categories and provides a code→name resolver.
 * Falls back to the code itself if no match is found.
 */
export function useServiceCategoryNames() {
  const [codeToName, setCodeToName] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('service_categories')
        .select('code, name')
        .eq('is_active', true);

      if (data) {
        const map: Record<string, string> = {};
        data.forEach((c) => { map[c.code] = c.name; });
        setCodeToName(map);
      }
      setIsLoaded(true);
    };
    fetch();
  }, []);

  const resolve = useCallback(
    (code: string) => codeToName[code] ?? code,
    [codeToName]
  );

  return { resolve, isLoaded };
}
