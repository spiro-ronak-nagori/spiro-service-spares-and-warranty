import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { JobCardStatus } from '@/types';

const BUCKET_LABELS = ['0–2h', '2–6h', '6–24h', '>24h'];
const BUCKET_COLORS = [
  'hsl(152, 69%, 40%)',
  'hsl(38, 92%, 50%)',
  'hsl(25, 80%, 50%)',
  'hsl(0, 70%, 50%)',
];

const CHART_TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid hsl(var(--border))',
  backgroundColor: 'hsl(var(--card))',
  color: 'hsl(var(--card-foreground))',
  fontSize: 12,
};

interface AgingRow {
  job_card_id: string;
  jc_number: string;
  reg_no: string;
  workshop_name: string;
  current_status: string;
  created_at: string;
  last_status_change_at: string;
  assigned_to_name: string | null;
}

function getAgeHours(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
}

function getBucket(hours: number): number {
  if (hours <= 2) return 0;
  if (hours <= 6) return 1;
  if (hours <= 24) return 2;
  return 3;
}

function formatAge(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: false });
}

interface AgingViewProps {
  workshopId: string | null;
  country: string | null;
}

export function AgingView({ workshopId, country }: AgingViewProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageMode, setAgeMode] = useState<'idle' | 'total'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params: Record<string, any> = {};
      if (workshopId) params.p_workshop_id = workshopId;
      if (country) params.p_country = country;

      const { data: rows, error } = await (supabase.rpc as any)('get_aging_data', params);

      if (!cancelled && !error && rows) {
        setData(rows);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workshopId, country]);

  const bucketData = useMemo(() => {
    const counts = [0, 0, 0, 0];
    data.forEach(row => {
      const ts = ageMode === 'idle' ? row.last_status_change_at : row.created_at;
      counts[getBucket(getAgeHours(ts))]++;
    });
    return BUCKET_LABELS.map((label, i) => ({
      bucket: label,
      count: counts[i],
      color: BUCKET_COLORS[i],
    }));
  }, [data, ageMode]);

  // Top 10 sorted by age (oldest first = most stuck)
  const stuckJcs = useMemo(() => {
    return [...data]
      .sort((a, b) => {
        const aTs = ageMode === 'idle' ? a.last_status_change_at : a.created_at;
        const bTs = ageMode === 'idle' ? b.last_status_change_at : b.created_at;
        return new Date(aTs).getTime() - new Date(bTs).getTime();
      })
      .slice(0, 10);
  }, [data, ageMode]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Aging of Open Job Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aging Buckets Chart */}
      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold">Aging of Open Job Cards (post-draft)</CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {ageMode === 'idle'
                  ? 'Idle Age: time since last status change (highlights stuck work). Draft/Delivered/Closed excluded.'
                  : 'Total Age: time since job card creation. Draft/Delivered/Closed excluded.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 shrink-0"
              onClick={() => setAgeMode(prev => (prev === 'idle' ? 'total' : 'idle'))}
            >
              {ageMode === 'idle' ? 'Idle Age' : 'Total Age'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No open job cards</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bucketData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Job Cards" radius={[4, 4, 0, 0]}>
                  {bucketData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Stuck Job Cards Table */}
      {stuckJcs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Stuck Job Cards (Top 10)</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Open JCs sorted by longest {ageMode === 'idle' ? 'idle' : 'total'} age
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">JC #</TableHead>
                    <TableHead className="text-xs">Reg No</TableHead>
                    <TableHead className="text-xs">Workshop</TableHead>
                    <TableHead className="text-xs">Stage</TableHead>
                    <TableHead className="text-xs">Idle Age</TableHead>
                    <TableHead className="text-xs">Total Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stuckJcs.map(jc => (
                    <TableRow
                      key={jc.job_card_id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/job-cards/${jc.job_card_id}`)}
                    >
                      <TableCell className="text-xs font-medium">{jc.jc_number}</TableCell>
                      <TableCell className="text-xs">{jc.reg_no}</TableCell>
                      <TableCell className="text-xs">{jc.workshop_name}</TableCell>
                      <TableCell>
                        <StatusPill status={jc.current_status as JobCardStatus} size="sm" />
                      </TableCell>
                      <TableCell className="text-xs">{formatAge(jc.last_status_change_at)}</TableCell>
                      <TableCell className="text-xs">{formatAge(jc.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
