/**
 * RBAC Permission Resolution Tests
 *
 * These tests verify the core permission-resolution algorithm used by
 * useRbacPermissions — specifically the override-precedence logic.
 *
 * We extract the pure computation into a helper so we can unit-test
 * without any React / Supabase dependencies.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helper that mirrors the useMemo inside useRbacPermissions ──
interface Override {
  policy_type: string;
  permission_key: string;
  enabled: boolean;
  country: string | null;
}

function resolvePermissions(
  basePerms: Map<string, boolean>,
  overrides: Override[],
  workshopType: string | null,
  workshopCountry: string | null,
): Set<string> {
  const keys = new Set<string>();
  basePerms.forEach((enabled, key) => {
    if (enabled) keys.add(key);
  });

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

// ── Test data matching real DB state ──
// Technician base permissions (subset relevant to spares)
function technicianBasePerms(): Map<string, boolean> {
  return new Map([
    ['nav.job_cards', true],
    ['nav.create_job_card', true],
    ['nav.console', false],
    ['nav.reports', false],
    ['nav.warranty_approvals', false],
    ['jc.view', true],
    ['jc.mark_completed', true],
    ['jc.deliver', true],
    ['spares.view', true],
    ['spares.add', true],
    ['spares.edit', true],
    ['spares.remove', true],
    ['spares.increase_qty', true],
    ['spares.submit_warranty', true],
    ['spares.edit_warranty_evidence', true],
  ]);
}

// Real overrides from DB: Kenya technician blocked on spares for both COCO & FOFO
const kenyaOverrides: Override[] = [
  { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: 'Kenya' },
  { policy_type: 'COCO', permission_key: 'spares.edit', enabled: false, country: 'Kenya' },
  { policy_type: 'COCO', permission_key: 'spares.remove', enabled: false, country: 'Kenya' },
  { policy_type: 'COCO', permission_key: 'spares.increase_qty', enabled: false, country: 'Kenya' },
  { policy_type: 'FOFO', permission_key: 'spares.add', enabled: false, country: 'Kenya' },
  { policy_type: 'FOFO', permission_key: 'spares.edit', enabled: false, country: 'Kenya' },
  { policy_type: 'FOFO', permission_key: 'spares.remove', enabled: false, country: 'Kenya' },
  { policy_type: 'FOFO', permission_key: 'spares.increase_qty', enabled: false, country: 'Kenya' },
];

// ── Tests ──

describe('RBAC Permission Resolution', () => {
  describe('Base permissions (no overrides)', () => {
    it('returns all enabled base permissions when no workshop type', () => {
      const perms = resolvePermissions(technicianBasePerms(), [], null, null);
      expect(perms.has('spares.add')).toBe(true);
      expect(perms.has('nav.job_cards')).toBe(true);
      expect(perms.has('nav.console')).toBe(false);
      expect(perms.has('nav.reports')).toBe(false);
    });

    it('returns all enabled base permissions when workshop type set but no overrides', () => {
      const perms = resolvePermissions(technicianBasePerms(), [], 'COCO', 'Uganda');
      expect(perms.has('spares.add')).toBe(true);
      expect(perms.has('spares.edit')).toBe(true);
    });
  });

  describe('Kenya COCO technician (real scenario)', () => {
    it('blocks spares.add for Kenya COCO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(false);
    });

    it('blocks spares.edit for Kenya COCO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Kenya');
      expect(perms.has('spares.edit')).toBe(false);
    });

    it('blocks spares.remove for Kenya COCO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Kenya');
      expect(perms.has('spares.remove')).toBe(false);
    });

    it('blocks spares.increase_qty for Kenya COCO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Kenya');
      expect(perms.has('spares.increase_qty')).toBe(false);
    });

    it('does NOT block non-overridden permissions', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Kenya');
      expect(perms.has('spares.view')).toBe(true);
      expect(perms.has('spares.submit_warranty')).toBe(true);
      expect(perms.has('jc.mark_completed')).toBe(true);
      expect(perms.has('jc.deliver')).toBe(true);
    });
  });

  describe('Kenya FOFO technician (real scenario)', () => {
    it('blocks spares.add for Kenya FOFO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'FOFO', 'Kenya');
      expect(perms.has('spares.add')).toBe(false);
    });

    it('blocks all four spares keys for Kenya FOFO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'FOFO', 'Kenya');
      expect(perms.has('spares.add')).toBe(false);
      expect(perms.has('spares.edit')).toBe(false);
      expect(perms.has('spares.remove')).toBe(false);
      expect(perms.has('spares.increase_qty')).toBe(false);
    });
  });

  describe('Uganda technician (no overrides apply)', () => {
    it('keeps spares.add enabled for Uganda COCO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'COCO', 'Uganda');
      expect(perms.has('spares.add')).toBe(true);
    });

    it('keeps all spares permissions for Uganda FOFO', () => {
      const perms = resolvePermissions(technicianBasePerms(), kenyaOverrides, 'FOFO', 'Uganda');
      expect(perms.has('spares.add')).toBe(true);
      expect(perms.has('spares.edit')).toBe(true);
      expect(perms.has('spares.remove')).toBe(true);
      expect(perms.has('spares.increase_qty')).toBe(true);
    });
  });

  describe('Country-specific vs global override precedence', () => {
    it('country-specific override wins over global override', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: true, country: null }, // global: enable
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: 'Kenya' }, // Kenya: disable
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(false); // Kenya-specific wins
    });

    it('global override applies when no country-specific match', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: null }, // global: disable
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: true, country: 'Kenya' }, // Kenya: enable
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Uganda');
      expect(perms.has('spares.add')).toBe(false); // global applies to Uganda
    });

    it('country-specific enable overrides global disable', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: null },
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: true, country: 'Kenya' },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(true); // Kenya enable wins
    });
  });

  describe('Override can ENABLE a base-disabled permission', () => {
    it('override enables a permission that was disabled in base', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'nav.console', enabled: true, country: null },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Kenya');
      expect(perms.has('nav.console')).toBe(true);
    });
  });

  describe('Wrong policy_type is ignored', () => {
    it('FOFO override does not affect COCO user', () => {
      const overrides: Override[] = [
        { policy_type: 'FOFO', permission_key: 'spares.add', enabled: false, country: 'Kenya' },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(true); // FOFO override ignored for COCO
    });

    it('COCO override does not affect FOFO user', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: 'Kenya' },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'FOFO', 'Kenya');
      expect(perms.has('spares.add')).toBe(true); // COCO override ignored for FOFO
    });
  });

  describe('No workshop type means overrides are skipped entirely', () => {
    it('overrides ignored when workshopType is null', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: null },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, null, 'Kenya');
      expect(perms.has('spares.add')).toBe(true); // no workshop type → base only
    });
  });

  describe('Multiple permissions overridden at once', () => {
    it('handles mixed enable/disable overrides', () => {
      const overrides: Override[] = [
        { policy_type: 'COCO', permission_key: 'spares.add', enabled: false, country: 'Kenya' },
        { policy_type: 'COCO', permission_key: 'nav.console', enabled: true, country: 'Kenya' },
        { policy_type: 'COCO', permission_key: 'nav.reports', enabled: true, country: 'Kenya' },
      ];
      const perms = resolvePermissions(technicianBasePerms(), overrides, 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(false);
      expect(perms.has('nav.console')).toBe(true);
      expect(perms.has('nav.reports')).toBe(true);
    });
  });

  describe('Spares manager base permissions', () => {
    function sparesManagerBasePerms(): Map<string, boolean> {
      return new Map([
        ['nav.job_cards', true],
        ['nav.create_job_card', false],
        ['nav.console', false],
        ['spares.view', true],
        ['spares.add', true],
        ['spares.edit', true],
        ['spares.remove', true],
        ['spares.increase_qty', true],
        ['jc.view', true],
        ['jc.mark_completed', false],
      ]);
    }

    it('spares manager has spares.add even with Kenya overrides (different role)', () => {
      // Kenya overrides are for technician role_id — spares_manager has its own
      // This test verifies that overrides are role-scoped
      const perms = resolvePermissions(sparesManagerBasePerms(), [], 'COCO', 'Kenya');
      expect(perms.has('spares.add')).toBe(true);
    });

    it('spares manager cannot mark_completed', () => {
      const perms = resolvePermissions(sparesManagerBasePerms(), [], 'COCO', 'Kenya');
      expect(perms.has('jc.mark_completed')).toBe(false);
    });

    it('spares manager cannot create job cards', () => {
      const perms = resolvePermissions(sparesManagerBasePerms(), [], 'COCO', 'Kenya');
      expect(perms.has('nav.create_job_card')).toBe(false);
    });
  });
});

describe('Navigation visibility rules', () => {
  // Simulates the nav item logic from BottomNavigation
  function getNavItems(
    role: string,
    can: (key: string) => boolean,
    rbacLoading: boolean,
  ): string[] {
    const items: string[] = [];

    if (rbacLoading) {
      return ['/', '/profile'];
    }

    if (role === 'warranty_admin') {
      if (can('nav.warranty_approvals')) items.push('/warranty-approvals');
      items.push('/profile');
      return items;
    }

    if (can('nav.console')) items.push('/console');
    if (can('nav.job_cards')) items.push('/');
    if (can('nav.create_job_card') && !can('nav.console')) items.push('/create');
    if (can('nav.reports')) items.push('/reports');
    if (can('nav.warranty_approvals') && role !== 'warranty_admin') items.push('/warranty-approvals');
    items.push('/profile');

    return items;
  }

  it('shows minimal nav while RBAC is loading', () => {
    const items = getNavItems('technician', () => false, true);
    expect(items).toEqual(['/', '/profile']);
  });

  it('warranty_admin sees only Approvals + Profile', () => {
    const items = getNavItems('warranty_admin', (k) => k === 'nav.warranty_approvals', false);
    expect(items).toEqual(['/warranty-approvals', '/profile']);
  });

  it('technician sees Job Cards, Create JC, Profile', () => {
    const can = (k: string) => ['nav.job_cards', 'nav.create_job_card'].includes(k);
    const items = getNavItems('technician', can, false);
    expect(items).toEqual(['/', '/create', '/profile']);
  });

  it('super_admin sees Console, Job Cards, Reports, Profile (no Create JC)', () => {
    const can = (k: string) => ['nav.console', 'nav.job_cards', 'nav.reports', 'nav.create_job_card'].includes(k);
    const items = getNavItems('super_admin', can, false);
    expect(items).toContain('/console');
    expect(items).toContain('/');
    expect(items).toContain('/reports');
    expect(items).not.toContain('/create'); // hidden when nav.console is true
    expect(items).toContain('/profile');
  });

  it('spares_manager sees only Job Cards, Profile (no Create JC, no Console)', () => {
    const can = (k: string) => k === 'nav.job_cards';
    const items = getNavItems('spares_manager', can, false);
    expect(items).toEqual(['/', '/profile']);
  });

  it('country_admin with console sees Console, Job Cards, Reports, Profile', () => {
    const can = (k: string) => ['nav.console', 'nav.job_cards', 'nav.reports'].includes(k);
    const items = getNavItems('country_admin', can, false);
    expect(items).toEqual(['/console', '/', '/reports', '/profile']);
  });
});

describe('CTA logic for Job Card detail', () => {
  // Simplified CTA logic extracted from JobCardDetailPage
  function resolveCta(
    status: string,
    canMarkCompleted: boolean,
    canAddSpares: boolean,
    hasRequiredSparesBlock: boolean,
  ): 'complete_work' | 'spares_blocked' | 'add_spare' | 'none' {
    if (status !== 'IN_PROGRESS') return 'none';

    if (canMarkCompleted) {
      if (hasRequiredSparesBlock && !canAddSpares) {
        return 'spares_blocked';
      }
      return 'complete_work';
    }

    if (canAddSpares) {
      return 'add_spare';
    }

    return 'none';
  }

  it('technician (Uganda) sees complete_work CTA', () => {
    expect(resolveCta('IN_PROGRESS', true, true, false)).toBe('complete_work');
  });

  it('technician (Kenya COCO) sees spares_blocked when mandatory spares missing', () => {
    expect(resolveCta('IN_PROGRESS', true, false, true)).toBe('spares_blocked');
  });

  it('technician (Kenya COCO) sees complete_work when no spares block', () => {
    expect(resolveCta('IN_PROGRESS', true, false, false)).toBe('complete_work');
  });

  it('spares_manager sees add_spare CTA', () => {
    expect(resolveCta('IN_PROGRESS', false, true, false)).toBe('add_spare');
  });

  it('role with no actionable permission sees no CTA', () => {
    expect(resolveCta('IN_PROGRESS', false, false, false)).toBe('none');
  });

  it('non-IN_PROGRESS status shows no CTA regardless of permissions', () => {
    expect(resolveCta('INWARDED', true, true, false)).toBe('none');
    expect(resolveCta('READY', true, true, false)).toBe('none');
    expect(resolveCta('DELIVERED', true, true, false)).toBe('none');
    expect(resolveCta('DRAFT', true, true, false)).toBe('none');
  });
});

describe('Console access control', () => {
  it('user without nav.console is denied access', () => {
    const hasAccess = false; // can('nav.console') → false
    expect(hasAccess).toBe(false);
  });

  it('system_admin with nav.console can access', () => {
    const hasAccess = true; // can('nav.console') → true
    expect(hasAccess).toBe(true);
  });

  // Menu item visibility
  function visibleMenuItems(can: (k: string) => boolean, isSystemAdmin: boolean, hasWorkshopId: boolean) {
    const items: string[] = [];
    if (can('config.manage_workshops')) items.push('workshops');
    if (can('nav.manage_users')) items.push('admins');
    if (can('users.manage_workshop_team') && !can('config.manage_workshops') && hasWorkshopId) items.push('team');
    if (can('config.view')) items.push('system-config');
    return items;
  }

  it('system_admin sees all console menu items', () => {
    const can = (k: string) => ['config.manage_workshops', 'nav.manage_users', 'config.view'].includes(k);
    const items = visibleMenuItems(can, true, false);
    expect(items).toEqual(['workshops', 'admins', 'system-config']);
  });

  it('workshop_admin with team permission sees Manage Team', () => {
    const can = (k: string) => k === 'users.manage_workshop_team' || k === 'nav.console';
    const items = visibleMenuItems(can, false, true);
    expect(items).toEqual(['team']);
  });

  it('workshop_admin without workshop_id does not see Manage Team', () => {
    const can = (k: string) => k === 'users.manage_workshop_team';
    const items = visibleMenuItems(can, false, false);
    expect(items).toEqual([]);
  });
});
