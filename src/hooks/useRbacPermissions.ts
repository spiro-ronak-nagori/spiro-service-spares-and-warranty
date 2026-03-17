import { useMemo, useCallback } from 'react';
import { usePermissionBundle, OverrideEntry } from '@/contexts/PermissionContext';
import { useAuth } from '@/contexts/AuthContext';

interface RbacPermissionState {
  /** Check if user has a specific permission */
  can: (permissionKey: string) => boolean;
  /** All permission keys that are enabled for this user */
  enabledKeys: Set<string>;
  /** Whether permissions are still loading */
  isLoading: boolean;
}

/**
 * Compute effective permission set from cached bundle, applying
 * workshop-type + country overlay.
 *
 * Pure computation — no DB fetches. Everything comes from PermissionContext cache.
 */
function computeEnabledKeys(
  basePerms: Record<string, boolean>,
  overrides: OverrideEntry[],
  workshopType: string | null,
  workshopCountry: string | null,
): Set<string> {
  const keys = new Set<string>();

  for (const [key, enabled] of Object.entries(basePerms)) {
    if (enabled) keys.add(key);
  }

  if (workshopType) {
    const relevantOverrides = overrides.filter(ov => ov.policy_type === workshopType);
    const bestOverride = new Map<string, { enabled: boolean; specificity: number }>();

    for (const ov of relevantOverrides) {
      const isCountryMatch = workshopCountry && ov.country === workshopCountry;
      const isGlobal = ov.country === null || ov.country === undefined;

      if (!isCountryMatch && !isGlobal) continue;

      const specificity = isCountryMatch ? 2 : 1;
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
}

/**
 * RBAC runtime permission hook.
 *
 * Uses the cached permission bundle from PermissionContext.
 * Applies COCO/FOFO policy overrides based on workshop type and country.
 *
 * Pass optional workshopTypeOverride / workshopCountryOverride
 * for job-card-level checks where the JC's workshop may differ from the user's home workshop.
 */
export function useRbacPermissions(
  workshopTypeOverride?: string | null,
  workshopCountryOverride?: string | null,
): RbacPermissionState {
  const { bundle, isLoading } = usePermissionBundle();
  const { workshop } = useAuth();

  const workshopType = workshopTypeOverride ?? bundle?.workshopType ?? workshop?.type ?? null;
  const workshopCountry = workshopCountryOverride ?? bundle?.workshopCountry ?? workshop?.country ?? null;

  const enabledKeys = useMemo(() => {
    if (!bundle) return new Set<string>();
    return computeEnabledKeys(bundle.basePerms, bundle.overrides, workshopType, workshopCountry);
  }, [bundle, workshopType, workshopCountry]);

  const can = useCallback(
    (permissionKey: string) => enabledKeys.has(permissionKey),
    [enabledKeys],
  );

  return { can, enabledKeys, isLoading };
}

// ── Convenience helpers ──

/** Check if user can view a resource area */
export function useCanView(area: string): boolean {
  const { can, isLoading } = useRbacPermissions();
  return !isLoading && can(`nav.${area}`);
}

/** Check if user can perform an action */
export function useCanAct(action: string): boolean {
  const { can, isLoading } = useRbacPermissions();
  return !isLoading && can(action);
}
