import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VehicleModel {
  id: string;
  name: string;
  sort_order: number;
}

let cachedModels: VehicleModel[] | null = null;

export function useVehicleModels() {
  const [models, setModels] = useState<VehicleModel[]>(cachedModels || []);
  const [isLoading, setIsLoading] = useState(!cachedModels);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedModels) return;
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('vehicle_models')
          .select('id, name, sort_order')
          .eq('is_active', true)
          .order('sort_order');

        if (fetchError) throw fetchError;
        const result = (data || []) as VehicleModel[];
        cachedModels = result;
        setModels(result);
      } catch (err) {
        console.error('Failed to fetch vehicle models:', err);
        setError('Unable to load models, try again');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const modelNames = models.map(m => m.name);

  return { models, modelNames, isLoading, error };
}
