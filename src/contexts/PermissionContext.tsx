import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──

export interface ResolvedPermissionBundle {
  userId: string;
  role: string;
  scopeType: string | null;
  workshopId: string | null;
  workshopType: string | null;
  workshopCountry: string | null;
  countryIds: string[];
  workshopIds: string[];
  /** Base permissions from rbac_permissions table */
  basePerms: Record<string, boolean>;
  /** Raw policy overrides for runtime overlay computation */
  overrides: OverrideEntry[];
  /** Permission version marker for staleness detection */
  permissionVersion: string;
  /** ISO timestamp when this bundle was resolved */
  resolvedAt: string;
  /** Resolution time in ms */
  resolutionMs: number;
}

export interface OverrideEntry {
  policy_type: string;
  permission_key: string;
  enabled: boolean;
  country: string | null;
}

interface PermissionContextType {
  bundle: ResolvedPermissionBundle | null;
  isLoading: boolean;
  /** Force refresh the permission bundle */
  refresh: () => Promise<void>;
  /** Debug info */
  diagnostics: {
    fetchCount: number;
    cacheHits: number;
    lastRefreshSource: 'fresh' | 'cache' | 'none';
  };
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// ── Storage helpers ──

const CACHE_KEY = 'rbac_permission_bundle';
const VERSION_KEY = 'rbac_permission_version';

function saveToStorage(bundle: ResolvedPermissionBundle) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    // quota exceeded or unavailable — ignore
  }
}

function loadFromStorage(): ResolvedPermissionBundle | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResolvedPermissionBundle;
  } catch {
    return null;
  }
}

function clearStorage() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(VERSION_KEY);
  } catch {
    // ignore
  }
}

// ── Provider ──

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { profile, workshop, user } = useAuth();
  const [bundle, setBundle] = useState<ResolvedPermissionBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchCountRef = useRef(0);
  const cacheHitsRef = useRef(0);
  const lastSourceRef = useRef<'fresh' | 'cache' | 'none'>('none');
  const resolvingRef = useRef(false);

  const roleKey = profile?.role;
  const userId = user?.id;

  const resolvePermissions = useCallback(async (force = false) => {
    if (!roleKey || !userId) {
      setBundle(null);
      setIsLoading(false);
      clearStorage();
      return;
    }

    if (resolvingRef.current && !force) return;
    resolvingRef.current = true;

    const startMs = performance.now();

    try {
      // 1. Check DB version
      const { data: versionRow } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'RBAC_PERMISSION_VERSION')
        .maybeSingle();

      const dbVersion = versionRow?.value ?? '0';

      // 2. Try sessionStorage cache
      if (!force) {
        const cached = loadFromStorage();
        if (
          cached &&
          cached.userId === userId &&
          cached.role === roleKey &&
          cached.permissionVersion === dbVersion &&
          cached.workshopId === (profile?.workshop_id ?? null) &&
          cached.workshopCountry === (workshop?.country ?? null)
        ) {
          setBundle(cached);
          setIsLoading(false);
          cacheHitsRef.current++;
          lastSourceRef.current = 'cache';
          resolvingRef.current = false;
          if (import.meta.env.DEV) {
            console.debug('[RBAC Cache] Using cached bundle', {
              version: dbVersion,
              resolvedAt: cached.resolvedAt,
              resolutionMs: cached.resolutionMs,
            });
          }
          return;
        }
      }

      // 3. Fresh fetch
      fetchCountRef.current++;

      const { data: roleData } = await supabase
        .from('rbac_roles')
        .select('id, default_scope')
        .eq('role_key', roleKey as any)
        .single();

      if (!roleData) {
        setBundle(null);
        setIsLoading(false);
        resolvingRef.current = false;
        return;
      }

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

      const basePerms: Record<string, boolean> = {};
      (permRes.data || []).forEach((p: any) => {
        basePerms[p.permission_key] = p.enabled;
      });

      const overrides: OverrideEntry[] = (ovRes.data || []).map((ov: any) => ({
        policy_type: ov.policy_type,
        permission_key: ov.permission_key,
        enabled: ov.enabled,
        country: ov.country,
      }));

      const resolutionMs = Math.round(performance.now() - startMs);

      const resolved: ResolvedPermissionBundle = {
        userId,
        role: roleKey as string,
        scopeType: roleData.default_scope ?? null,
        workshopId: profile?.workshop_id ?? null,
        workshopType: (workshop?.type as string) ?? null,
        workshopCountry: workshop?.country ?? null,
        countryIds: profile?.country ? [profile.country] : [],
        workshopIds: profile?.workshop_id ? [profile.workshop_id] : [],
        basePerms,
        overrides,
        permissionVersion: dbVersion,
        resolvedAt: new Date().toISOString(),
        resolutionMs,
      };

      setBundle(resolved);
      saveToStorage(resolved);
      lastSourceRef.current = 'fresh';

      if (import.meta.env.DEV) {
        console.debug('[RBAC Cache] Fresh resolution', {
          version: dbVersion,
          permCount: Object.keys(basePerms).length,
          overrideCount: overrides.length,
          resolutionMs,
          fetchNumber: fetchCountRef.current,
        });
      }
    } catch (err) {
      console.error('[RBAC Cache] Resolution error', err);
    } finally {
      setIsLoading(false);
      resolvingRef.current = false;
    }
  }, [roleKey, userId, profile?.workshop_id, profile?.country, workshop?.type, workshop?.country]);

  // Resolve on auth/profile change
  useEffect(() => {
    if (!userId || !roleKey) {
      setBundle(null);
      setIsLoading(false);
      clearStorage();
      return;
    }
    setIsLoading(true);
    resolvePermissions();
  }, [resolvePermissions, userId, roleKey]);

  // Periodic staleness check (every 5 minutes)
  useEffect(() => {
    if (!userId || !roleKey) return;

    const interval = setInterval(async () => {
      try {
        const { data: versionRow } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'RBAC_PERMISSION_VERSION')
          .maybeSingle();

        const dbVersion = versionRow?.value ?? '0';
        if (bundle && bundle.permissionVersion !== dbVersion) {
          if (import.meta.env.DEV) {
            console.debug('[RBAC Cache] Version mismatch, refreshing', {
              cached: bundle.permissionVersion,
              db: dbVersion,
            });
          }
          resolvePermissions(true);
        }
      } catch {
        // Network issue — keep using cache
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [userId, roleKey, bundle, resolvePermissions]);

  const refresh = useCallback(async () => {
    await resolvePermissions(true);
  }, [resolvePermissions]);

  return (
    <PermissionContext.Provider
      value={{
        bundle,
        isLoading,
        refresh,
        diagnostics: {
          fetchCount: fetchCountRef.current,
          cacheHits: cacheHitsRef.current,
          lastRefreshSource: lastSourceRef.current,
        },
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionBundle() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissionBundle must be used within PermissionProvider');
  return ctx;
}
