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
      // If no model, return all active parts with warning
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

      // Look up model ID
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

      // Get applicable part IDs
      let query = supabase
        .from('spare_parts_applicability' as any)
        .select('spare_part_id')
        .eq('vehicle_model_id', modelData.id);

      // Filter by color_code: match exact OR null
      if (colorCode && ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'].includes(colorCode)) {
        query = query.or(`color_code.eq.${colorCode},color_code.is.null`);
      } else {
        if (colorCode) w.push('Vehicle color not recognized — filtering by model only.');
        query = query.is('color_code', null);
      }

      const { data: appData } = await query;
      const partIds = [...new Set((appData || []).map((a: any) => a.spare_part_id))];

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

      // Fetch photos + part details for each spare
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
