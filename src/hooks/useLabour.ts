import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LabourMasterItem {
  id: string;
  country: string;
  labour_code: string | null;
  labour_name: string;
  description: string | null;
  standard_duration_minutes: number;
  default_rate: number | null;
  is_active: boolean;
  duration_editable: boolean;
  rate_editable: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobCardLabourEntry {
  id: string;
  job_card_id: string;
  labour_master_id: string;
  duration_minutes: number;
  rate: number | null;
  remarks: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  labour_master?: LabourMasterItem;
}

/**
 * Fetch labour master catalog for a country.
 */
export function useLabourMaster(country: string | null) {
  const [items, setItems] = useState<LabourMasterItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!country) { setItems([]); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('labour_master' as any)
        .select('*')
        .eq('country', country)
        .order('labour_name');
      if (error) throw error;
      setItems((data || []) as unknown as LabourMasterItem[]);
    } catch (err) {
      console.error('Failed to fetch labour master:', err);
    } finally {
      setIsLoading(false);
    }
  }, [country]);

  useEffect(() => { fetch(); }, [fetch]);

  return { items, isLoading, refetch: fetch };
}

/**
 * Fetch labour entries for a job card.
 */
export function useJobCardLabour(jobCardId: string | undefined) {
  const [entries, setEntries] = useState<JobCardLabourEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!jobCardId) { setEntries([]); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_card_labour' as any)
        .select('*, labour_master(*)')
        .eq('job_card_id', jobCardId)
        .order('created_at');
      if (error) throw error;
      setEntries((data || []) as unknown as JobCardLabourEntry[]);
    } catch (err) {
      console.error('Failed to fetch job card labour:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobCardId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entries, isLoading, refetch: fetch };
}

/**
 * Add labour entry to a job card.
 */
export async function addJobCardLabour(
  jobCardId: string,
  labourMasterId: string,
  durationMinutes: number,
  rate: number | null,
  remarks: string | null,
  profileId: string,
) {
  const { data, error } = await supabase
    .from('job_card_labour' as any)
    .insert({
      job_card_id: jobCardId,
      labour_master_id: labourMasterId,
      duration_minutes: durationMinutes,
      rate,
      remarks,
      created_by: profileId,
    })
    .select()
    .single();
  if (error) throw error;

  // Audit
  await supabase.from('labour_audit_log' as any).insert({
    action: 'ADD',
    entity_type: 'JC_LABOUR',
    entity_id: (data as any).id,
    job_card_id: jobCardId,
    actor_user_id: profileId,
    new_value: JSON.stringify({ labour_master_id: labourMasterId, duration_minutes: durationMinutes, rate, remarks }),
  });

  return data;
}

/**
 * Update a labour entry on a job card.
 */
export async function updateJobCardLabour(
  id: string,
  updates: { duration_minutes?: number; rate?: number | null; remarks?: string | null },
  profileId: string,
  jobCardId: string,
) {
  const { error } = await supabase
    .from('job_card_labour' as any)
    .update({ ...updates, updated_by: profileId })
    .eq('id', id);
  if (error) throw error;

  await supabase.from('labour_audit_log' as any).insert({
    action: 'EDIT',
    entity_type: 'JC_LABOUR',
    entity_id: id,
    job_card_id: jobCardId,
    actor_user_id: profileId,
    new_value: JSON.stringify(updates),
  });
}

/**
 * Delete a labour entry from a job card.
 */
export async function deleteJobCardLabour(id: string, profileId: string, jobCardId: string) {
  const { error } = await supabase
    .from('job_card_labour' as any)
    .delete()
    .eq('id', id);
  if (error) throw error;

  await supabase.from('labour_audit_log' as any).insert({
    action: 'REMOVE',
    entity_type: 'JC_LABOUR',
    entity_id: id,
    job_card_id: jobCardId,
    actor_user_id: profileId,
  });
}
