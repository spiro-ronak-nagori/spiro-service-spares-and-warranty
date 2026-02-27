import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  INWARDED: 'hsl(38, 92%, 50%)',
  IN_PROGRESS: 'hsl(210, 80%, 55%)',
  READY: 'hsl(152, 69%, 31%)',
  REOPENED: 'hsl(38, 70%, 60%)',
  DELIVERED: 'hsl(160, 50%, 40%)',
};

const STATUS_LABELS: Record<string, string> = {
  INWARDED: 'Inwarded',
  IN_PROGRESS: 'In Progress',
  READY: 'Ready',
  REOPENED: 'Reopened',
  DELIVERED: 'Delivered',
};

const ALLOWED_STATUSES = ['INWARDED', 'IN_PROGRESS', 'READY', 'REOPENED', 'DELIVERED'];

const CHART_TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid hsl(var(--border))',
  backgroundColor: 'hsl(var(--card))',
  color: 'hsl(var(--card-foreground))',
  fontSize: 12,
};

interface WipSnapshotChartProps {
  startDate: string;
  endDate: string;
  workshopId: string | null;
  country: string | null;
}

export function WipSnapshotChart({ startDate, endDate, workshopId, country }: WipSnapshotChartProps) {
  const [data, setData] = useState<{ snapshot_date: string; status: string; jc_count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params: Record<string, any> = {
        p_start_date: startDate,
        p_end_date: endDate,
      };
      if (workshopId) params.p_workshop_id = workshopId;
      if (country) params.p_country = country;

      const { data: rows, error } = await (supabase.rpc as any)('get_wip_snapshot', params);

      if (!cancelled && !error && rows) {
        setData(rows);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate, workshopId, country]);

  const chartData = useMemo(() => {
    const dateMap: Record<string, any> = {};

    data.forEach(row => {
      if (!ALLOWED_STATUSES.includes(row.status)) return;

      if (!dateMap[row.snapshot_date]) {
        dateMap[row.snapshot_date] = {
          date: row.snapshot_date,
          label: format(new Date(row.snapshot_date + 'T00:00:00'), 'dd MMM'),
        };
        ALLOWED_STATUSES.forEach(s => {
          dateMap[row.snapshot_date][STATUS_LABELS[s]] = 0;
        });
      }
      const label = STATUS_LABELS[row.status] || row.status;
      dateMap[row.snapshot_date][label] = (dateMap[row.snapshot_date][label] || 0) + Number(row.jc_count);
    });

    return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [data]);

  const activeLabels = ALLOWED_STATUSES.map(s => STATUS_LABELS[s]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Daily WIP Snapshot + Deliveries (post-draft)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">Daily WIP Snapshot + Deliveries (post-draft)</CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Active stages carry forward. Delivered shows only on delivery day.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No snapshot data</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {activeLabels.map(label => {
                const statusKey = Object.entries(STATUS_LABELS).find(([, v]) => v === label)?.[0] || label;
                return (
                  <Bar key={label} dataKey={label} stackId="a" fill={STATUS_COLORS[statusKey] || 'hsl(var(--muted))'} />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
