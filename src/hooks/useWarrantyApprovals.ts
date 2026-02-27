import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { JobCardSpare, JobCardSparePhoto, SparePart, SpareAction } from '@/types';

export interface ApprovalQueueItem {
  spare: JobCardSpare;
  jc_number: string;
  workshop_name: string;
  technician_name: string;
  vehicle_reg_no: string;
  vehicle_model: string | null;
  vehicle_color: string | null;
  odometer: number;
  odometer_photo_url: string | null;
  job_card_id: string;
  tat_minutes: number;
}

export type TatBucket = '<4h' | '4-12h' | '12-24h' | '>24h';

export function getTatBucket(tatMinutes: number): TatBucket {
  if (tatMinutes < 240) return '<4h';
  if (tatMinutes < 720) return '4-12h';
  if (tatMinutes < 1440) return '12-24h';
  return '>24h';
}

export function formatTat(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

interface Filters {
  country?: string;
  workshopId?: string;
  status?: string;
  search?: string;
}

export function useWarrantyApprovalQueue(filters: Filters) {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get spares in SUBMITTED or RESUBMITTED state
      let sparesQuery = supabase
        .from('job_card_spares' as any)
        .select('*')
        .in('approval_state', ['SUBMITTED', 'RESUBMITTED']);

      if (filters.status && filters.status !== 'all') {
        sparesQuery = sparesQuery.eq('approval_state', filters.status);
      }

      const { data: sparesData } = await sparesQuery;
      const sparesList = (sparesData || []) as unknown as JobCardSpare[];

      if (sparesList.length === 0) {
        setItems([]);
        return;
      }

      // Get unique job card IDs and spare part IDs
      const jcIds = [...new Set(sparesList.map(s => s.job_card_id))];
      const partIds = [...new Set(sparesList.map(s => s.spare_part_id))];
      const spareIds = sparesList.map(s => s.id);

      // Fetch job cards, parts, and photos in parallel
      const [jcRes, partsRes, photosRes] = await Promise.all([
        supabase
          .from('job_cards')
          .select(`
            id, jc_number, odometer, odometer_photo_url, workshop_id, assigned_to,
            vehicle:vehicles(reg_no, model, color),
            workshop:workshops(name, country),
            assignee:profiles!job_cards_assigned_to_fkey(full_name)
          `)
          .in('id', jcIds),
        supabase
          .from('spare_parts_master' as any)
          .select('*')
          .in('id', partIds),
        supabase
          .from('job_card_spare_photos' as any)
          .select('*')
          .in('job_card_spare_id', spareIds),
      ]);

      const jcMap = new Map((jcRes.data || []).map((jc: any) => [jc.id, jc]));
      const partsMap = new Map((partsRes.data || []).map((p: any) => [p.id, p as SparePart]));
      const photos = (photosRes.data || []) as unknown as JobCardSparePhoto[];

      // Generate signed URLs for photos
      if (photos.length > 0) {
        const paths = photos.map(p => {
          const marker = '/spare-photos/';
          const idx = p.photo_url.indexOf(marker);
          return idx !== -1 ? p.photo_url.substring(idx + marker.length) : p.photo_url;
        });
        const { data: signedData } = await supabase.storage
          .from('spare-photos')
          .createSignedUrls(paths, 3600);
        if (signedData) {
          signedData.forEach((s, i) => {
            if (s.signedUrl) photos[i].photo_url = s.signedUrl;
          });
        }
      }

      const now = Date.now();
      const result: ApprovalQueueItem[] = [];

      for (const spare of sparesList) {
        const jc = jcMap.get(spare.job_card_id);
        if (!jc) continue;

        const part = partsMap.get(spare.spare_part_id);
        // Check if approval is actually needed
        if (part) {
          const isWarranty = spare.claim_type === 'WARRANTY';
          const approvalNeeded = isWarranty ? part.warranty_approval_needed : part.goodwill_approval_needed;
          if (!approvalNeeded) continue;
        }

        // Apply filters
        if (filters.country && jc.workshop?.country !== filters.country) continue;
        if (filters.workshopId && jc.workshop_id !== filters.workshopId) continue;

        spare.spare_part = part;
        spare.photos = photos.filter(p => p.job_card_spare_id === spare.id);

        const tatMs = now - new Date(spare.last_submitted_at || spare.submitted_at || spare.created_at).getTime();
        const tatMinutes = tatMs / 60000;

        const vehicle = jc.vehicle as any;

        // Search filter
        if (filters.search) {
          const s = filters.search.toLowerCase();
          const searchable = `${jc.jc_number} ${vehicle?.reg_no || ''}`.toLowerCase();
          if (!searchable.includes(s)) continue;
        }

        result.push({
          spare,
          jc_number: jc.jc_number,
          workshop_name: jc.workshop?.name || '',
          technician_name: (jc.assignee as any)?.full_name || '—',
          vehicle_reg_no: vehicle?.reg_no || '',
          vehicle_model: vehicle?.model || null,
          vehicle_color: vehicle?.color || null,
          odometer: jc.odometer,
          odometer_photo_url: jc.odometer_photo_url,
          job_card_id: jc.id,
          tat_minutes: tatMinutes,
        });
      }

      // Sort by TAT descending (longest wait first)
      result.sort((a, b) => b.tat_minutes - a.tat_minutes);
      setItems(result);
    } catch (err) {
      console.error('Failed to fetch approval queue:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters.country, filters.workshopId, filters.status, filters.search]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return { items, isLoading, refetch: fetchQueue };
}

export async function approveSpare(spareId: string, actorUserId: string, comment?: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('job_card_spares' as any)
    .update({ approval_state: 'APPROVED', decided_at: now } as any)
    .eq('id', spareId);
  if (error) throw error;

  await supabase.from('job_card_spare_actions' as any).insert({
    job_card_spare_id: spareId,
    action_type: 'APPROVE',
    comment: comment || null,
    actor_user_id: actorUserId,
  } as any);
}

export async function rejectSpare(spareId: string, actorUserId: string, comment?: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('job_card_spares' as any)
    .update({ approval_state: 'REJECTED', decided_at: now } as any)
    .eq('id', spareId);
  if (error) throw error;

  await supabase.from('job_card_spare_actions' as any).insert({
    job_card_spare_id: spareId,
    action_type: 'REJECT',
    comment: comment || null,
    actor_user_id: actorUserId,
  } as any);
}

export async function requestMoreInfo(spareId: string, actorUserId: string, comment: string) {
  const { error } = await supabase
    .from('job_card_spares' as any)
    .update({ approval_state: 'NEEDS_INFO' } as any)
    .eq('id', spareId);
  if (error) throw error;

  await supabase.from('job_card_spare_actions' as any).insert({
    job_card_spare_id: spareId,
    action_type: 'REQUEST_INFO',
    comment,
    actor_user_id: actorUserId,
  } as any);
}

export async function respondToNeedsInfo(spareId: string, actorUserId: string, comment: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('job_card_spares' as any)
    .update({ approval_state: 'RESUBMITTED', last_submitted_at: now } as any)
    .eq('id', spareId);
  if (error) throw error;

  await Promise.all([
    supabase.from('job_card_spare_actions' as any).insert({
      job_card_spare_id: spareId,
      action_type: 'TECH_RESPONSE',
      comment,
      actor_user_id: actorUserId,
    } as any),
    supabase.from('job_card_spare_actions' as any).insert({
      job_card_spare_id: spareId,
      action_type: 'RESUBMIT',
      comment: null,
      actor_user_id: actorUserId,
    } as any),
  ]);
}

export async function fetchSpareActions(spareId: string): Promise<SpareAction[]> {
  const { data } = await supabase
    .from('job_card_spare_actions' as any)
    .select('*')
    .eq('job_card_spare_id', spareId)
    .order('created_at', { ascending: true });

  const actions = (data || []) as unknown as SpareAction[];

  // Fetch actor names
  if (actions.length > 0) {
    const userIds = [...new Set(actions.map(a => a.actor_user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds);
    const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
    actions.forEach(a => {
      a.actor = { full_name: nameMap.get(a.actor_user_id) || 'Unknown' };
    });
  }

  return actions;
}
