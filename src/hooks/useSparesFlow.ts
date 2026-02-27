import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SparePart, SparePartApplicability, JobCardSpare, JobCardSparePhoto } from '@/types';

export function useSparesFeatureFlags() {
  const [sparesEnabled, setSparesEnabled] = useState(false);
  const [warrantyEnabled, setWarrantyEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['ENABLE_SPARES_FLOW', 'ENABLE_WARRANTY_FLOW']);

        (data || []).forEach((row: any) => {
          if (row.key === 'ENABLE_SPARES_FLOW') setSparesEnabled(row.value === 'true');
          if (row.key === 'ENABLE_WARRANTY_FLOW') setWarrantyEnabled(row.value === 'true');
        });
      } catch (err) {
        console.error('Failed to load spares flags:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { sparesEnabled, warrantyEnabled, isLoading };
}

export function useApplicableSpareParts(vehicleModelName: string | null | undefined, colorCode: string | null | undefined) {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetchParts();
  }, [vehicleModelName, colorCode]);

  const fetchParts = async () => {
    setIsLoading(true);
    const w: string[] = [];

    try {
      if (!vehicleModelName) {
        w.push('Vehicle model is missing — showing all available spare parts.');
        const { data } = await supabase
          .from('spare_parts_master' as any)
          .select('*')
          .eq('active', true)
          .order('part_name');
        setParts((data || []) as unknown as SparePart[]);
        setWarnings(w);
        return;
      }

      const { data: modelData } = await supabase
        .from('vehicle_models')
        .select('id')
        .eq('name', vehicleModelName)
        .maybeSingle();

      if (!modelData) {
        w.push('Vehicle model not found in master — showing all available spare parts.');
        const { data } = await supabase
          .from('spare_parts_master' as any)
          .select('*')
          .eq('active', true)
          .order('part_name');
        setParts((data || []) as unknown as SparePart[]);
        setWarnings(w);
        return;
      }

      const { data: appData } = await supabase
        .from('spare_parts_applicability' as any)
        .select('spare_part_id, color_code')
        .eq('vehicle_model_id', modelData.id);

      const allMappings = (appData || []) as unknown as { spare_part_id: string; color_code: string | null }[];

      if (allMappings.length === 0) {
        w.push('No spare parts mapped for this vehicle configuration.');
        setParts([]);
        setWarnings(w);
        return;
      }

      const partIdSet = new Set<string>();
      const validColorCodes = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'];
      const vehicleColor = colorCode && validColorCodes.includes(colorCode) ? colorCode : null;

      if (!vehicleColor && colorCode) {
        w.push('Vehicle color not recognized — filtering by model only.');
      }

      const byPart = new Map<string, { specific: boolean; allColors: boolean }>();
      for (const m of allMappings) {
        const entry = byPart.get(m.spare_part_id) || { specific: false, allColors: false };
        if (m.color_code === null) {
          entry.allColors = true;
        } else if (vehicleColor && m.color_code === vehicleColor) {
          entry.specific = true;
        }
        if (m.color_code === null || (vehicleColor && m.color_code === vehicleColor)) {
          byPart.set(m.spare_part_id, entry);
        }
      }

      for (const [partId] of byPart) {
        partIdSet.add(partId);
      }

      const partIds = [...partIdSet];
      if (partIds.length === 0) {
        w.push('No spare parts mapped for this vehicle configuration.');
        setParts([]);
        setWarnings(w);
        return;
      }

      const { data: partsData } = await supabase
        .from('spare_parts_master' as any)
        .select('*')
        .eq('active', true)
        .in('id', partIds)
        .order('part_name');

      setParts((partsData || []) as unknown as SparePart[]);
    } catch (err) {
      console.error('Failed to load applicable parts:', err);
    } finally {
      setIsLoading(false);
      setWarnings(w);
    }
  };

  return { parts, isLoading, warnings };
}

/**
 * Extract storage path from a photo_url.
 * Handles both full URLs and plain paths.
 */
function extractStoragePath(photoUrl: string): string {
  // If it's a full URL, extract the path after the bucket name
  const marker = '/spare-photos/';
  const idx = photoUrl.indexOf(marker);
  if (idx !== -1) return photoUrl.substring(idx + marker.length);
  // Otherwise assume it's already a path
  return photoUrl;
}

export function useJobCardSpares(jobCardId: string | undefined) {
  const [spares, setSpares] = useState<JobCardSpare[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSpares = useCallback(async () => {
    if (!jobCardId) return;
    setIsLoading(true);
    try {
      const { data: sparesData } = await supabase
        .from('job_card_spares' as any)
        .select('*')
        .eq('job_card_id', jobCardId)
        .order('created_at');

      const sparesList = (sparesData || []) as unknown as JobCardSpare[];

      if (sparesList.length > 0) {
        const spareIds = sparesList.map(s => s.id);
        const partIds = [...new Set(sparesList.map(s => s.spare_part_id))];

        const [photosRes, partsRes] = await Promise.all([
          supabase
            .from('job_card_spare_photos' as any)
            .select('*')
            .in('job_card_spare_id', spareIds),
          supabase
            .from('spare_parts_master' as any)
            .select('*')
            .in('id', partIds),
        ]);

        const photos = (photosRes.data || []) as unknown as JobCardSparePhoto[];
        const partsMap = new Map((partsRes.data || []).map((p: any) => [p.id, p as SparePart]));

        // Generate signed URLs for photos (private bucket)
        if (photos.length > 0) {
          const paths = photos.map(p => extractStoragePath(p.photo_url));
          const { data: signedData } = await supabase.storage
            .from('spare-photos')
            .createSignedUrls(paths, 3600);

          if (signedData) {
            signedData.forEach((s, i) => {
              if (s.signedUrl) photos[i].photo_url = s.signedUrl;
            });
          }
        }

        sparesList.forEach(s => {
          s.photos = photos.filter(p => p.job_card_spare_id === s.id);
          s.spare_part = partsMap.get(s.spare_part_id);
        });
      }

      setSpares(sparesList);
    } catch (err) {
      console.error('Failed to load job card spares:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobCardId]);

  useEffect(() => {
    fetchSpares();
  }, [fetchSpares]);

  return { spares, isLoading, refetch: fetchSpares };
}

export async function deleteJobCardSpare(spareId: string): Promise<void> {
  // Delete photos first (FK constraint)
  await supabase
    .from('job_card_spare_photos' as any)
    .delete()
    .eq('job_card_spare_id', spareId);

  const { error } = await supabase
    .from('job_card_spares' as any)
    .delete()
    .eq('id', spareId);

  if (error) throw error;
}

/**
 * Withdraw a submitted spare claim back to DRAFT.
 * Resets approval fields, clears old-part serial, deletes OLD_PART_EVIDENCE photos.
 */
export async function withdrawSpare(spareId: string, actorProfileId: string): Promise<void> {
  // 1. Look up denormalized fields before deletion
  const { data: spareRow } = await supabase
    .from('job_card_spares' as any)
    .select('job_card_id')
    .eq('id', spareId)
    .maybeSingle();
  const jobCardId = (spareRow as any)?.job_card_id || null;
  let workshopId: string | null = null;
  if (jobCardId) {
    const { data: jcRow } = await supabase
      .from('job_cards')
      .select('workshop_id')
      .eq('id', jobCardId)
      .maybeSingle();
    workshopId = jcRow?.workshop_id || null;
  }

  // 2. Delete OLD_PART_EVIDENCE photos for this spare
  await supabase
    .from('job_card_spare_photos' as any)
    .delete()
    .eq('job_card_spare_id', spareId)
    .eq('photo_kind', 'OLD_PART_EVIDENCE');

  // 3. Reset the spare line to DRAFT
  const { error } = await supabase
    .from('job_card_spares' as any)
    .update({
      approval_state: 'DRAFT',
      submitted_at: null,
      last_submitted_at: null,
      decided_at: null,
      old_part_serial_number: null,
      claim_comment: null,
      submitted_by: null,
      updated_by: actorProfileId,
    } as any)
    .eq('id', spareId);

  if (error) throw error;

  // 4. Log WITHDRAW action
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    await supabase.from('job_card_spare_actions' as any).insert({
      job_card_spare_id: spareId,
      job_card_id: jobCardId,
      workshop_id: workshopId,
      action_type: 'WITHDRAW',
      comment: null,
      actor_user_id: userData.user.id,
    } as any);
  }
}
