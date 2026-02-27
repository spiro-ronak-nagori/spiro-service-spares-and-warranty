import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell, LabelList,
} from 'recharts';
import {
  ClipboardList, Truck, Activity, Clock, Timer, TrendingUp,
  RotateCcw, Star, RefreshCw,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { WipSnapshotChart } from '@/components/reports/WipSnapshotChart';
import { AgingView } from '@/components/reports/AgingView';
import { DownloadReportsMenu } from '@/components/reports/DownloadReportsMenu';

interface SnapshotRow {
  snapshot_date: string;
  country: string;
  workshop_id: string;
  service_type: string;
  workshop_type: string;
  total_created: number;
  total_delivered: number;
  active_floor: number;
  pending_delivery: number;
  avg_mttr_minutes: number;
  avg_turnaround_minutes: number;
  reopen_percent: number;
  avg_feedback_score: number;
  feedback_count: number;
  draft_count: number;
  inwarded_count: number;
  in_progress_count: number;
  ready_count: number;
  delivered_count: number;
  closed_count: number;
  reopened_count: number;
  draft_to_inwarded_avg: number;
  inwarded_to_progress_avg: number;
  progress_to_ready_avg: number;
  ready_to_delivered_avg: number;
}

const CHART_TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid hsl(var(--border))',
  backgroundColor: 'hsl(var(--card))',
  color: 'hsl(var(--card-foreground))',
  fontSize: 12,
};

// STATUS_COLORS removed — replaced by WipSnapshotChart component

const TAT_BAR_COLORS = [
  'hsl(38, 92%, 50%)',
  'hsl(210, 80%, 55%)',
  'hsl(152, 69%, 31%)',
  'hsl(160, 50%, 40%)',
];

const formatMinutes = (m: number) => {
  if (m === 0) return '—';
  if (m < 1) return `${Math.round(m * 60)}s`;
  if (m < 60) return `${Math.round(m)}m`;
  const hrs = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

export default function ReportsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7' | '15' | '30'>('7');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedWorkshop, setSelectedWorkshop] = useState<string>('all');
  const [countries, setCountries] = useState<string[]>([]);
  const [workshops, setWorkshops] = useState<{ id: string; name: string; country: string }[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const prevFilterRef = useRef<string>('');

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';
  const isCountryAdmin = profile?.role === 'country_admin';
  const isManagement = isSuperAdmin || isCountryAdmin;

  // Redirect non-management users
  useEffect(() => {
    if (profile && !isManagement) {
      navigate('/', { replace: true });
    }
  }, [profile, isManagement, navigate]);

  // Load workshops and countries
  useEffect(() => {
    if (!isManagement) return;
    (async () => {
      let query = supabase.from('workshops').select('id, name, country');
      if (isCountryAdmin && profile?.country) {
        query = query.eq('country', profile.country);
      }
      const { data } = await query;
      if (data) {
        setWorkshops(data as { id: string; name: string; country: string }[]);
        const uniqueCountries = [...new Set(data.map(w => w.country).filter(Boolean))] as string[];
        setCountries(uniqueCountries);
        if (isCountryAdmin && profile?.country) {
          setSelectedCountry(profile.country);
        }
      }
    })();
  }, [isManagement, isCountryAdmin, profile?.country]);

  // Load last refresh time
  useEffect(() => {
    supabase
      .from('report_refresh_log' as any)
      .select('triggered_at')
      .order('triggered_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setLastRefresh((data as any).triggered_at);
      });
  }, []);

  // Fetch snapshots
  const fetchSnapshots = useCallback(async () => {
    if (!isManagement) return;
    const filterKey = `${period}-${selectedCountry}-${selectedWorkshop}`;
    if (filterKey === prevFilterRef.current && snapshots.length > 0) return;
    prevFilterRef.current = filterKey;

    setLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    let since: string;
    let until: string | null = null;

    if (period === 'today') {
      since = today;
      until = today;
    } else if (period === 'yesterday') {
      since = yesterday;
      until = yesterday;
    } else {
      since = format(subDays(new Date(), parseInt(period)), 'yyyy-MM-dd');
    }

    let query = supabase
      .from('report_daily_snapshot' as any)
      .select('*')
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true });

    if (until) {
      query = query.lte('snapshot_date', until);
    }
    if (selectedCountry !== 'all') {
      query = query.eq('country', selectedCountry);
    }
    if (selectedWorkshop !== 'all') {
      query = query.eq('workshop_id', selectedWorkshop);
    }

    const { data, error } = await query;
    if (!error && data) {
      setSnapshots(data as unknown as SnapshotRow[]);
    }
    setLoading(false);
  }, [isManagement, period, selectedCountry, selectedWorkshop]);

  useEffect(() => {
    prevFilterRef.current = '';
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Filtered workshops by country
  const filteredWorkshops = useMemo(() => {
    if (selectedCountry === 'all') return workshops;
    return workshops.filter(w => w.country === selectedCountry);
  }, [workshops, selectedCountry]);

  // Reset workshop when country changes
  useEffect(() => {
    setSelectedWorkshop('all');
  }, [selectedCountry]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-report-snapshot');
      // supabase.functions.invoke returns the parsed body in `data` even for non-2xx when the response is JSON
      // Check data first for throttle, then check error
      const responseBody = data || (error ? (() => { try { return JSON.parse(error.message); } catch { return null; } })() : null);
      if (responseBody?.error === 'THROTTLED') {
        toast({ title: 'Please wait', description: 'Data was refreshed recently. Please try again after 5 minutes.' });
        setRefreshing(false);
        return;
      }
      if (error) {
        throw error;
      }
      if (data?.error === 'THROTTLED') {
        toast({ title: 'Please wait', description: 'Data was refreshed recently. Please try again after 5 minutes.' });
      } else {
        toast({ title: 'Snapshot refreshed', description: `${data?.rows_generated || 0} rows generated.` });
        setLastRefresh(new Date().toISOString());
        prevFilterRef.current = '';
        await fetchSnapshots();
      }
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  // Aggregated KPIs
  const kpis = useMemo(() => {
    if (!snapshots.length) return null;
    const allRows = snapshots;

    const sum = (rows: SnapshotRow[], key: keyof SnapshotRow) =>
      rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const avg = (rows: SnapshotRow[], key: keyof SnapshotRow) => {
      const vals = rows.map(r => Number(r[key])).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    // Trend: compare to previous equivalent period (only for day-range periods)
    const days = ['7', '15', '30'].includes(period) ? parseInt(period) : null;
    const prevStart = days ? format(subDays(new Date(), days * 2), 'yyyy-MM-dd') : null;
    const prevEnd = days ? format(subDays(new Date(), days), 'yyyy-MM-dd') : null;
    const prevRows = (prevStart && prevEnd)
      ? snapshots.filter(s => s.snapshot_date >= prevStart && s.snapshot_date < prevEnd)
      : [];

    // Latest snapshot date for point-in-time metrics
    const latestDate = allRows.reduce((max, r) => r.snapshot_date > max ? r.snapshot_date : max, allRows[0].snapshot_date);
    const latestRows = allRows.filter(r => r.snapshot_date === latestDate);

    return {
      // Row 1: created/delivered are cumulative sums; floor/pending are point-in-time from latest snapshot
      totalCreated: sum(allRows, 'total_created'),
      totalDelivered: sum(allRows, 'total_delivered'),
      activeFloor: sum(latestRows, 'active_floor'),
      pendingDelivery: sum(latestRows, 'pending_delivery'),
      // Row 2: averages
      avgMttr: avg(allRows, 'avg_mttr_minutes'),
      avgTurnaround: avg(allRows, 'avg_turnaround_minutes'),
      reopenPercent: avg(allRows, 'reopen_percent'),
      avgFeedback: (() => {
        // Weighted average: sum(avg_score * count) / sum(count)
        const withFeedback = allRows.filter(r => (r.feedback_count || 0) > 0);
        if (!withFeedback.length) return 0;
        const totalCount = withFeedback.reduce((a, r) => a + (r.feedback_count || 0), 0);
        const weightedSum = withFeedback.reduce((a, r) => a + (Number(r.avg_feedback_score) || 0) * (r.feedback_count || 0), 0);
        return totalCount > 0 ? weightedSum / totalCount : 0;
      })(),
      // Trend comparisons
      prevCreated: sum(prevRows, 'total_created'),
      prevDelivered: sum(prevRows, 'total_delivered'),
    };
  }, [snapshots, period]);

  // Daily trend chart data
  const dailyTrend = useMemo(() => {
    const dateMap: Record<string, { date: string; label: string; created: number; delivered: number }> = {};
    snapshots.forEach(s => {
      if (!dateMap[s.snapshot_date]) {
        dateMap[s.snapshot_date] = {
          date: s.snapshot_date,
          label: format(new Date(s.snapshot_date + 'T00:00:00'), 'dd MMM'),
          created: 0,
          delivered: 0,
        };
      }
      dateMap[s.snapshot_date].created += s.total_created;
      dateMap[s.snapshot_date].delivered += s.total_delivered;
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshots]);

  // Compute date range for WIP snapshot
  const wipDateRange = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    if (period === 'today') return { start: today, end: today };
    if (period === 'yesterday') return { start: yesterday, end: yesterday };
    return { start: format(subDays(new Date(), parseInt(period)), 'yyyy-MM-dd'), end: today };
  }, [period]);

  // Stage TAT horizontal bar data
  const stageTat = useMemo(() => {
    const avgField = (key: keyof SnapshotRow) => {
      const vals = snapshots.map(s => Number(s[key])).filter(v => v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    return [
      { stage: 'Draft → Inwarded', shortStage: 'Draft→Inw', minutes: avgField('draft_to_inwarded_avg') },
      { stage: 'Inwarded → In Progress', shortStage: 'Inw→InProg', minutes: avgField('inwarded_to_progress_avg') },
      { stage: 'In Progress → Ready', shortStage: 'InProg→Ready', minutes: avgField('progress_to_ready_avg') },
      { stage: 'Ready → Delivered', shortStage: 'Ready→Del', minutes: avgField('ready_to_delivered_avg') },
    ];
  }, [snapshots]);

  if (!isManagement) return null;

  if (loading && snapshots.length === 0) {
    return (
      <AppLayout>
        <PageHeader title="Reports" />
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Management Reports" />

      <div className="p-4 space-y-4 pb-24">
        {/* Sticky Filter Bar */}
        <div className="sticky top-0 z-10 bg-background py-3 -mx-4 px-4 border-b border-border space-y-1.5">
          <div className="flex items-center gap-2">
            {/* Scrollable filter area */}
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="flex items-center gap-2 w-max">
                <Select value={period} onValueChange={(v) => setPeriod(v as 'today' | 'yesterday' | '7' | '15' | '30')}>
                  <SelectTrigger className="w-[130px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="15">Last 15 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>

                {isSuperAdmin && countries.length > 0 && (
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="w-[140px] shrink-0">
                      <SelectValue placeholder="All Countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {countries.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {filteredWorkshops.length > 0 && (
                  <Select value={selectedWorkshop} onValueChange={setSelectedWorkshop}>
                    <SelectTrigger className="w-[160px] shrink-0">
                      <SelectValue placeholder="All Workshops" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Workshops</SelectItem>
                      {filteredWorkshops.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Pinned action buttons */}
            {isManagement && (
              <DownloadReportsMenu
                dateFrom={wipDateRange.start}
                dateTo={wipDateRange.end}
                countryId={selectedCountry !== 'all' ? selectedCountry : null}
                workshopId={selectedWorkshop !== 'all' ? selectedWorkshop : null}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="shrink-0 h-9 w-9"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Refresh data</p></TooltipContent>
            </Tooltip>
          </div>

          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Last Updated: {format(new Date(lastRefresh), 'dd MMM yyyy, HH:mm')}
            </p>
          )}
        </div>

        {/* KPI Cards - Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={ClipboardList} label="JC Created" value={kpis?.totalCreated ?? 0} tooltip="Job cards inwarded in the selected period" trend={kpis ? { current: kpis.totalCreated, previous: kpis.prevCreated } : undefined} />
          <KpiCard icon={Truck} label="Deliveries" value={kpis?.totalDelivered ?? 0} tooltip="Job cards delivered in the selected period" trend={kpis ? { current: kpis.totalDelivered, previous: kpis.prevDelivered } : undefined} />
          <KpiCard icon={Activity} label="Active Floor" value={kpis?.activeFloor ?? 0} tooltip="Jobs on floor: Inwarded, In Progress, or Reopened (excludes Draft & Ready)" variant="warning" />
          <KpiCard icon={Clock} label="Pending Delivery" value={kpis?.pendingDelivery ?? 0} tooltip="Jobs marked Ready, awaiting delivery" variant="warning" />
        </div>

        {/* KPI Cards - Row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Timer} label="Avg MTTR" value={formatMinutes(kpis?.avgMttr ?? 0)} tooltip="Mean Time To Repair: avg time from In Progress → Ready (work started to work completed)" />
          <KpiCard icon={TrendingUp} label="Avg Turnaround" value={formatMinutes(kpis?.avgTurnaround ?? 0)} tooltip="Average turnaround: Inwarded → Delivered" />
          <KpiCard icon={RotateCcw} label="Reopen %" value={kpis ? `${kpis.reopenPercent.toFixed(1)}%` : '—'} tooltip="Percentage of jobs reopened in the selected period" variant={kpis && kpis.reopenPercent > 5 ? 'destructive' : 'default'} />
          <KpiCard icon={Star} label="Avg Feedback" value={kpis && kpis.avgFeedback > 0 ? kpis.avgFeedback.toFixed(1) : '—'} tooltip="Average customer feedback score" variant="success" />
        </div>

        {/* Chart 1: Daily Created vs Delivered */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Daily Created vs Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrend.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyTrend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={Math.max(0, Math.floor(dailyTrend.length / 7) - 1)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="created" stroke="hsl(210, 80%, 55%)" strokeWidth={2} name="Created" dot={false} />
                  <Line type="monotone" dataKey="delivered" stroke="hsl(152, 69%, 31%)" strokeWidth={2} name="Delivered" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 2: WIP Snapshot (replaces Stage Distribution) */}
          <WipSnapshotChart
            startDate={wipDateRange.start}
            endDate={wipDateRange.end}
            workshopId={selectedWorkshop !== 'all' ? selectedWorkshop : null}
            country={selectedCountry !== 'all' ? selectedCountry : null}
          />

          {/* Chart 3: Stage-wise Avg TAT */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Stage-wise Avg TAT</CardTitle>
            </CardHeader>
            <CardContent>
              {stageTat.every(s => s.minutes === null) ? (
                <p className="text-center text-muted-foreground text-sm py-8">No TAT data</p>
              ) : (
                <StageTatChart data={stageTat} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Aging View */}
        <AgingView
          workshopId={selectedWorkshop !== 'all' ? selectedWorkshop : null}
          country={selectedCountry !== 'all' ? selectedCountry : null}
        />
      </div>
    </AppLayout>
  );
}

// --- Stage TAT Chart ---

function StageTatChart({ data }: { data: { stage: string; shortStage: string; minutes: number | null }[] }) {
  const chartData = data.map((d, i) => ({
    stage: d.stage,
    shortStage: d.shortStage,
    minutes: d.minutes ?? 0,
    isNull: d.minutes === null,
    color: TAT_BAR_COLORS[i],
    label: d.minutes === null ? 'N/A' : formatMinutes(d.minutes),
  }));

  const maxVal = Math.max(...chartData.map(d => d.minutes), 1);

  return (
    <div className="space-y-2.5">
      {chartData.map((d, i) => (
        <div key={i} className="space-y-1">
          <p className="text-[11px] text-muted-foreground truncate">{d.stage}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-7 bg-muted rounded overflow-hidden relative">
              {d.minutes > 0 && (
                <div
                  className="h-full rounded flex items-center justify-end pr-2 transition-all"
                  style={{
                    width: `${Math.max((d.minutes / maxVal) * 100, 12)}%`,
                    backgroundColor: d.color,
                  }}
                >
                  <span className="text-[11px] font-medium text-white drop-shadow-sm">{d.label}</span>
                </div>
              )}
              {d.isNull && (
                <div className="absolute inset-0 flex items-center pl-3">
                  <span className="text-[11px] text-muted-foreground italic">N/A</span>
                </div>
              )}
              {!d.isNull && d.minutes === 0 && (
                <div className="absolute inset-0 flex items-center pl-3">
                  <span className="text-[11px] text-muted-foreground">0m</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- KPI Card Component ---

function KpiCard({
  icon: Icon,
  label,
  value,
  tooltip,
  variant = 'default',
  trend,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number | string;
  tooltip: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  trend?: { current: number; previous: number };
}) {
  const iconColors = {
    default: 'text-primary',
    success: 'text-emerald-600',
    warning: 'text-amber-500',
    destructive: 'text-destructive',
  };

  const trendIndicator = useMemo(() => {
    if (!trend || trend.previous === 0) return null;
    const pct = ((trend.current - trend.previous) / trend.previous) * 100;
    if (Math.abs(pct) < 1) return null;
    const isUp = pct > 0;
    return (
      <span className={`text-[10px] font-medium ${isUp ? 'text-emerald-600' : 'text-destructive'}`}>
        {isUp ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
      </span>
    );
  }, [trend]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="cursor-default">
          <CardContent className="py-3 px-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className={`h-4 w-4 ${iconColors[variant]}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xl font-bold leading-none truncate">{value}</p>
                {trendIndicator}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</p>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
