import { supabase } from '@/integrations/supabase/client';

/**
 * Template resolution: most-specific wins.
 * Priority: workshop(8) > country(4) > model(2) > global(1)
 */
export async function resolveChecklistTemplate(
  vehicleModel: string | null,
  workshopId: string,
  workshopCountry: string | null,
): Promise<{ id: string; name: string } | null> {
  const { data: allTemplates } = await supabase
    .from('checklist_templates' as any)
    .select('id, name, is_global, country_ids, workshop_ids')
    .eq('is_active', true)
    .order('created_at');

  if (!allTemplates || (allTemplates as any[]).length === 0) return null;

  let vehicleModelId: string | null = null;
  if (vehicleModel) {
    const { data: modelData } = await supabase
      .from('vehicle_models')
      .select('id')
      .eq('name', vehicleModel)
      .eq('is_active', true)
      .maybeSingle();
    vehicleModelId = modelData?.id || null;
  }

  const templateIds = (allTemplates as any[]).map((t: any) => t.id);
  const { data: appRows } = await supabase
    .from('checklist_template_applicability' as any)
    .select('template_id, vehicle_model_id')
    .in('template_id', templateIds);

  const appByTemplate = new Map<string, string[]>();
  for (const row of (appRows as any[]) || []) {
    const existing = appByTemplate.get(row.template_id) || [];
    existing.push(row.vehicle_model_id);
    appByTemplate.set(row.template_id, existing);
  }

  type Scored = { id: string; name: string; score: number };
  const scored: Scored[] = [];

  for (const t of allTemplates as any[]) {
    const tWorkshopIds: string[] = t.workshop_ids || [];
    const tCountryIds: string[] = t.country_ids || [];
    const tIsGlobal: boolean = t.is_global || false;
    const modelIds = appByTemplate.get(t.id) || [];

    const hasModelScope = modelIds.length > 0;
    const modelMatch = !hasModelScope || (vehicleModelId && modelIds.includes(vehicleModelId));
    if (!modelMatch) continue;

    const hasWorkshopScope = tWorkshopIds.length > 0;
    const workshopMatch = !hasWorkshopScope || tWorkshopIds.includes(workshopId);
    if (!workshopMatch && hasWorkshopScope) continue;

    const hasCountryScope = tCountryIds.length > 0;
    const countryMatch = !hasCountryScope || (workshopCountry && tCountryIds.includes(workshopCountry));
    if (!countryMatch && hasCountryScope) continue;

    if (!tIsGlobal && !hasWorkshopScope && !hasCountryScope && !hasModelScope) continue;

    let score = 0;
    if (hasWorkshopScope && workshopMatch) score += 8;
    if (hasCountryScope && countryMatch) score += 4;
    if (hasModelScope) score += 2;
    if (tIsGlobal) score += 1;

    if (tIsGlobal && !hasWorkshopScope && !hasCountryScope && !hasModelScope) score = 1;

    scored.push({ id: t.id, name: t.name, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return { id: scored[0].id, name: scored[0].name };
}
