import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface RbacPermissionState {
  /** Check if user has a specific permission */
  can: (permissionKey: string) => boolean;
  /** All permission keys that are enabled for this user */
  enabledKeys: Set<string>;
  /** Whether permissions are still loading */
  isLoading: boolean;
}

/**
 * RBAC runtime permission hook.
 * Fetches permissions for the current user's role, then applies
 * COCO/FOFO policy overrides based on the workshop type and country.
 *
 * Overrides are matched with country precedence:
 *   1. Country-specific override (exact match) wins
 *   2. Global override (country IS NULL) is fallback
 *
 * Pass an optional workshopTypeOverride / workshopCountryOverride
 * for job-card-level checks where the JC's workshop may differ from the user's home workshop.
 */
export function useRbacPermissions(
  workshopTypeOverride?: string | null,
  workshopCountryOverride?: string | null,
): RbacPermissionState {
  const { profile, workshop } = useAuth();
  const [basePerms, setBasePerms] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<{ policy_type: string; permission_key: string; enabled: boolean; country: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const roleKey = profile?.role;
  const workshopType = workshopTypeOverride ?? workshop?.type ?? null;
  const workshopCountry = workshopCountryOverride ?? workshop?.country ?? null;

  useEffect(() => {
    if (!roleKey) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const { data: roleData } = await supabase
          .from('rbac_roles')
          .select('id')
          .eq('role_key', roleKey as any)
          .single();

        if (!roleData || cancelled) { setIsLoading(false); return; }

        const [permRes, ovRes] = await Promise.all([
          supabase
            .from('rbac_permissions')
            .select('permission_key, enabled')
            .eq('role_id', roleData.id),
          supabase
            .from('rbac_policy_overrides')
            .select('policy_type, permission_key, enabled, country')
            .eq('role_id', roleData.id),
        ]);

        if (cancelled) return;

        const map = new Map<string, boolean>();
        (permRes.data || []).forEach((p: any) => map.set(p.permission_key, p.enabled));
        setBasePerms(map);
        setOverrides((ovRes.data || []) as any[]);
      } catch (err) {
        console.error('RBAC load error', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [roleKey]);

  // Compute effective permission set applying workshop-type + country overlay
  const enabledKeys = useMemo(() => {
    const keys = new Set<string>();
    basePerms.forEach((enabled, key) => {
      if (enabled) keys.add(key);
    });

    if (workshopType) {
      // Group overrides by permission_key for this policy_type
      // Then pick the most specific match: country-specific > global (null)
      const relevantOverrides = overrides.filter(ov => ov.policy_type === workshopType);

      // Build a map: permission_key -> best override
      const bestOverride = new Map<string, { enabled: boolean; specificity: number }>();

      for (const ov of relevantOverrides) {
        const isCountryMatch = workshopCountry && ov.country === workshopCountry;
        const isGlobal = ov.country === null || ov.country === undefined;

        if (!isCountryMatch && !isGlobal) continue; // different country, skip

        const specificity = isCountryMatch ? 2 : 1; // country-specific wins
        const current = bestOverride.get(ov.permission_key);

        if (!current || specificity > current.specificity) {
          bestOverride.set(ov.permission_key, { enabled: ov.enabled, specificity });
        }
      }

      for (const [permKey, { enabled }] of bestOverride) {
        if (enabled) {
          keys.add(permKey);
        } else {
          keys.delete(permKey);
        }
      }
    }

    return keys;
  }, [basePerms, overrides, workshopType, workshopCountry]);

  const can = useCallback(
    (permissionKey: string) => enabledKeys.has(permissionKey),
    [enabledKeys]
  );

  return { can, enabledKeys, isLoading };
}
