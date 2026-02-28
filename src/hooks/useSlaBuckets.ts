import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_CUTOFFS = [4, 12, 24];

export type SlaBucketLabel = string; // e.g. "<4h", "4-12h", ">24h"

export interface SlaBuckets {
  cutoffs: number[];
  labels: SlaBucketLabel[];
  isLoading: boolean;
}

/**
 * Derive bucket labels from cutoff hours.
 * e.g. [4,12,24] → ["<4h","4-12h","12-24h",">24h"]
 */
export function buildBucketLabels(cutoffs: number[]): SlaBucketLabel[] {
  if (cutoffs.length === 0) return ['all'];
  const labels: SlaBucketLabel[] = [`<${cutoffs[0]}h`];
  for (let i = 1; i < cutoffs.length; i++) {
    labels.push(`${cutoffs[i - 1]}-${cutoffs[i]}h`);
  }
  labels.push(`>${cutoffs[cutoffs.length - 1]}h`);
  return labels;
}

/**
 * Given TAT in minutes and cutoff hours, return the bucket label.
 */
export function getBucketForTat(tatMinutes: number, cutoffs: number[]): SlaBucketLabel {
  const labels = buildBucketLabels(cutoffs);
  const tatHours = tatMinutes / 60;
  for (let i = 0; i < cutoffs.length; i++) {
    if (tatHours < cutoffs[i]) return labels[i];
  }
  return labels[labels.length - 1];
}

/**
 * Hook to read the SLA bucket cutoffs from system_settings.
 */
export function useSlaBuckets(): SlaBuckets {
  const [cutoffs, setCutoffs] = useState<number[]>(DEFAULT_CUTOFFS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'warranty_sla_buckets_hours')
          .maybeSingle();
        if (!cancelled && data) {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCutoffs(parsed.map(Number));
          }
        }
      } catch (err) {
        console.error('Failed to read SLA buckets:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { cutoffs, labels: buildBucketLabels(cutoffs), isLoading };
}
