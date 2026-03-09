import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';

interface ChecklistItem {
  id: string;
  label: string;
  response_type: 'none' | 'text' | 'photo' | 'text_photo';
  is_mandatory: boolean;
  sort_order: number;
  photo_count: number;
  photo_prompts: string[];
}

interface ItemResponse {
  checked: boolean;
  text: string;
  photos: { file: File | null; preview: string | null }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  vehicleModel: string | null;
  workshopId: string;
  workshopCountry: string | null;
  onCompleted: () => void;
}

/**
 * Template resolution: most-specific wins.
 * Priority: workshop > country > model-only > global
 */
async function resolveTemplate(
  vehicleModel: string | null,
  workshopId: string,
  workshopCountry: string | null,
): Promise<{ id: string; name: string } | null> {
  // Fetch all active templates with their scoping
  const { data: allTemplates } = await supabase
    .from('checklist_templates' as any)
    .select('id, name, is_global, country_ids, workshop_ids')
    .eq('is_active', true)
    .order('created_at');

  if (!allTemplates || (allTemplates as any[]).length === 0) return null;

  // Get vehicle model ID if applicable
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

  // Fetch all applicability rows
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

  // Score each template: higher = more specific
  type Scored = { id: string; name: string; score: number };
  const scored: Scored[] = [];

  for (const t of allTemplates as any[]) {
    const tWorkshopIds: string[] = t.workshop_ids || [];
    const tCountryIds: string[] = t.country_ids || [];
    const tIsGlobal: boolean = t.is_global || false;
    const modelIds = appByTemplate.get(t.id) || [];

    // Check model match
    const hasModelScope = modelIds.length > 0;
    const modelMatch = !hasModelScope || (vehicleModelId && modelIds.includes(vehicleModelId));
    if (!modelMatch) continue;

    // Check workshop match
    const hasWorkshopScope = tWorkshopIds.length > 0;
    const workshopMatch = !hasWorkshopScope || tWorkshopIds.includes(workshopId);
    if (!workshopMatch && hasWorkshopScope) continue;

    // Check country match
    const hasCountryScope = tCountryIds.length > 0;
    const countryMatch = !hasCountryScope || (workshopCountry && tCountryIds.includes(workshopCountry));
    if (!countryMatch && hasCountryScope) continue;

    // Must be global or have at least one scope that matches
    if (!tIsGlobal && !hasWorkshopScope && !hasCountryScope && !hasModelScope) continue;

    // Score: workshop(8) + country(4) + model(2) + global(1)
    let score = 0;
    if (hasWorkshopScope && workshopMatch) score += 8;
    if (hasCountryScope && countryMatch) score += 4;
    if (hasModelScope) score += 2;
    if (tIsGlobal) score += 1;

    // Global with no scopes = base match
    if (tIsGlobal && !hasWorkshopScope && !hasCountryScope && !hasModelScope) score = 1;

    scored.push({ id: t.id, name: t.name, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return { id: scored[0].id, name: scored[0].name };
}

export function VehicleChecklistSheet({ open, onOpenChange, jobCardId, vehicleModel, workshopId, workshopCountry, onCompleted }: Props) {
  const { profile } = useAuth();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [responses, setResponses] = useState<Record<string, ItemResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noTemplate, setNoTemplate] = useState(false);

  useEffect(() => {
    if (open) loadChecklist();
  }, [open, jobCardId, vehicleModel]);

  const loadChecklist = async () => {
    setIsLoading(true);
    setNoTemplate(false);
    try {
      const resolved = await resolveTemplate(vehicleModel, workshopId, workshopCountry);

      if (!resolved) {
        setNoTemplate(true);
        setIsLoading(false);
        return;
      }

      setTemplateId(resolved.id);
      setTemplateName(resolved.name);

      const { data: itemsData, error } = await supabase
        .from('checklist_template_items' as any)
        .select('*')
        .eq('template_id', resolved.id)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;

      const fetchedItems: ChecklistItem[] = ((itemsData as any[]) || []).map((item: any) => ({
        ...item,
        photo_count: item.photo_count || 1,
        photo_prompts: Array.isArray(item.photo_prompts) ? item.photo_prompts : [],
      }));
      setItems(fetchedItems);

      const init: Record<string, ItemResponse> = {};
      fetchedItems.forEach(item => {
        const needsPhoto = item.response_type === 'photo' || item.response_type === 'text_photo';
        const slotCount = needsPhoto ? Math.max(item.photo_count, 1) : 0;
        init[item.id] = {
          checked: false,
          text: '',
          photos: Array.from({ length: slotCount }, () => ({ file: null, preview: null })),
        };
      });
      setResponses(init);
    } catch (err) {
      console.error('Failed to load checklist:', err);
      toast.error('Failed to load checklist');
    } finally {
      setIsLoading(false);
    }
  };

  const updateResponse = (itemId: string, update: Partial<ItemResponse>) => {
    setResponses(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...update } }));
  };

  const handlePhotoCapture = async (itemId: string, slotIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const preview = URL.createObjectURL(compressed);
      setResponses(prev => {
        const r = { ...prev[itemId] };
        const photos = [...r.photos];
        photos[slotIdx] = { file: compressed, preview };
        return { ...prev, [itemId]: { ...r, photos } };
      });
    } catch {
      toast.error('Failed to process photo');
    }
  };

  const clearPhoto = (itemId: string, slotIdx: number) => {
    setResponses(prev => {
      const r = { ...prev[itemId] };
      const photos = [...r.photos];
      photos[slotIdx] = { file: null, preview: null };
      return { ...prev, [itemId]: { ...r, photos } };
    });
  };

  const isValid = () => {
    return items.every(item => {
      const r = responses[item.id];
      if (!r) return !item.is_mandatory;
      if (!r.checked) return !item.is_mandatory;
      if (item.response_type === 'text' || item.response_type === 'text_photo') {
        if (item.is_mandatory && !r.text.trim()) return false;
      }
      if (item.response_type === 'photo' || item.response_type === 'text_photo') {
        if (item.is_mandatory) {
          // All photo slots must be filled
          if (r.photos.some(p => !p.file)) return false;
        }
      }
      return true;
    });
  };

  const handleSubmit = async () => {
    if (!templateId || !profile) return;
    setIsSubmitting(true);
    try {
      const { data: runData, error: runErr } = await supabase
        .from('checklist_runs' as any)
        .insert({
          job_card_id: jobCardId,
          template_id: templateId,
          template_name_snapshot: templateName,
          completed_by: profile.id,
        } as any)
        .select('id')
        .single();

      if (runErr) throw runErr;
      const runId = (runData as any).id;

      for (const item of items) {
        const r = responses[item.id];
        if (!r?.checked && !item.is_mandatory) continue;

        const photoUrls: string[] = [];
        if (r?.photos) {
          for (let i = 0; i < r.photos.length; i++) {
            const p = r.photos[i];
            if (p.file) {
              const path = `job_cards/${jobCardId}/checklist/${runId}/${item.id}_${i}_${Date.now()}.jpg`;
              const { error: uploadErr } = await supabase.storage
                .from('checklist-photos')
                .upload(path, p.file, { contentType: 'image/jpeg' });
              if (uploadErr) throw uploadErr;
              photoUrls.push(path);
            }
          }
        }

        const { error: itemErr } = await supabase
          .from('checklist_run_items' as any)
          .insert({
            checklist_run_id: runId,
            template_item_id: item.id,
            label_snapshot: item.label,
            response_type_snapshot: item.response_type,
            is_mandatory_snapshot: item.is_mandatory,
            text_response: r?.text?.trim() || null,
            photo_url: photoUrls[0] || null,
            photo_urls: JSON.stringify(photoUrls),
          } as any);

        if (itemErr) throw itemErr;
      }

      toast.success('Checklist completed');
      onCompleted();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to submit checklist:', err);
      toast.error(err.message || 'Failed to submit checklist');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Vehicle Checklist
          </SheetTitle>
          {templateName && <p className="text-xs text-muted-foreground">{templateName}</p>}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                <Skeleton className="h-5 w-5 shrink-0" />
                <div className="flex-1"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></div>
              </div>
            ))
          ) : noTemplate ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No checklist template configured for this vehicle.</p>
              <p className="text-xs text-muted-foreground mt-1">Contact your admin to set up a checklist template.</p>
              <Button variant="outline" className="mt-4" onClick={() => { onCompleted(); onOpenChange(false); }}>
                Skip & Continue
              </Button>
            </div>
          ) : (
            items.map(item => {
              const r = responses[item.id];
              const needsPhoto = item.response_type === 'photo' || item.response_type === 'text_photo';
              const needsText = item.response_type === 'text' || item.response_type === 'text_photo';
              return (
                <div key={item.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={r?.checked || false}
                      onCheckedChange={(checked) => updateResponse(item.id, { checked: !!checked })}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words leading-snug">{item.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {item.is_mandatory && <Badge variant="destructive" className="text-[10px] h-4">Required</Badge>}
                        <Badge variant="outline" className="text-[10px] h-4">
                          {item.response_type === 'none' ? 'Check' : item.response_type === 'text' ? 'Text' : item.response_type === 'photo' ? 'Photo' : 'Text+Photo'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {r?.checked && needsText && (
                    <div className="ml-8">
                      <Input
                        placeholder="Enter observation…"
                        value={r.text}
                        onChange={e => updateResponse(item.id, { text: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                  )}

                  {r?.checked && needsPhoto && (
                    <div className="ml-8 space-y-2">
                      {r.photos.map((photo, slotIdx) => {
                        const prompt = item.photo_prompts[slotIdx] || `Photo ${slotIdx + 1}`;
                        return (
                          <div key={slotIdx}>
                            <p className="text-xs text-muted-foreground mb-1">{prompt}</p>
                            {photo.preview ? (
                              <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                                <img src={photo.preview} alt={prompt} className="w-full h-full object-cover" />
                                <button
                                  className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs"
                                  onClick={() => clearPhoto(item.id, slotIdx)}
                                >×</button>
                              </div>
                            ) : (
                              <label className="flex items-center gap-2 cursor-pointer text-sm text-primary hover:underline">
                                <Camera className="h-4 w-4" />
                                <span>Capture</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={e => handlePhotoCapture(item.id, slotIdx, e)}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!isLoading && !noTemplate && (
          <SheetFooter className="shrink-0 pt-2 border-t">
            <Button
              className="w-full h-12 text-base"
              onClick={handleSubmit}
              disabled={isSubmitting || !isValid()}
            >
              {isSubmitting ? 'Submitting…' : 'Complete Checklist'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
