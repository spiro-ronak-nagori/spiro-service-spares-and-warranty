import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that fetches service categories and provides a code→name resolver.
 * Falls back to the code itself if no match is found.
 */
export function useServiceCategoryNames() {
  const [codeToName, setCodeToName] = useState<Record<string, string>>({});
  const [codeToParent, setCodeToParent] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('service_categories')
        .select('code, name, parent_code')
        .eq('is_active', true);

      if (data) {
        const nameMap: Record<string, string> = {};
        const parentMap: Record<string, string> = {};
        data.forEach((c) => {
          nameMap[c.code] = c.name;
          if (c.parent_code) parentMap[c.code] = c.parent_code;
        });
        setCodeToName(nameMap);
        setCodeToParent(parentMap);
      }
      setIsLoaded(true);
    };
    fetch();
  }, []);

  const resolve = useCallback(
    (code: string) => codeToName[code] ?? code,
    [codeToName]
  );

  const getParentCode = useCallback(
    (code: string) => codeToParent[code] ?? null,
    [codeToParent]
  );

  return { resolve, getParentCode, isLoaded };
}
