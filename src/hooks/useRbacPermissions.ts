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
 * COCO/FOFO policy overrides based on the workshop type.
 *
 * Usage:
 *   const { can, isLoading } = useRbacPermissions();
 *   if (can('spares.add')) { ... }
 *
 * Pass an optional workshopType override for job-card-level checks
 * where the JC's workshop type may differ from the user's home workshop.
 */
export function useRbacPermissions(workshopTypeOverride?: string | null): RbacPermissionState {
  const { profile, workshop } = useAuth();
  const [basePerms, setBasePerms] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<{ policy_type: string; permission_key: string; enabled: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const roleKey = profile?.role;
  // Workshop type: prefer the override (for JC context), then user's own workshop
  const workshopType = workshopTypeOverride ?? workshop?.type ?? null;

  useEffect(() => {
    if (!roleKey) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        // Fetch role ID
        const { data: roleData } = await supabase
          .from('rbac_roles')
          .select('id')
          .eq('role_key', roleKey as any)
          .single();

        if (!roleData || cancelled) { setIsLoading(false); return; }

        // Fetch base permissions
        const { data: permData } = await supabase
          .from('rbac_permissions')
          .select('permission_key, enabled')
          .eq('role_id', roleData.id);

        if (cancelled) return;

        const map = new Map<string, boolean>();
        (permData || []).forEach((p: any) => map.set(p.permission_key, p.enabled));
        setBasePerms(map);

        // Fetch policy overrides for this role
        const { data: ovData } = await supabase
          .from('rbac_policy_overrides')
          .select('policy_type, permission_key, enabled')
          .eq('role_id', roleData.id);

        if (cancelled) return;
        setOverrides((ovData || []) as any[]);
      } catch (err) {
        console.error('RBAC load error', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [roleKey]);

  // Compute effective permission set applying workshop-type overlay
  const enabledKeys = useMemo(() => {
    const keys = new Set<string>();
    basePerms.forEach((enabled, key) => {
      if (enabled) keys.add(key);
    });

    // Apply COCO/FOFO overrides if workshop type matches
    if (workshopType) {
      for (const ov of overrides) {
        if (ov.policy_type === workshopType) {
          if (ov.enabled) {
            keys.add(ov.permission_key);
          } else {
            keys.delete(ov.permission_key);
          }
        }
      }
    }

    return keys;
  }, [basePerms, overrides, workshopType]);

  const can = useCallback(
    (permissionKey: string) => enabledKeys.has(permissionKey),
    [enabledKeys]
  );

  return { can, enabledKeys, isLoading };
}
