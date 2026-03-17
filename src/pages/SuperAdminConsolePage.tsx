import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Settings, ChevronRight, ShieldCheck, Loader2, Sheet, CheckCircle2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRbacPermissions } from '@/hooks/useRbacPermissions';

export default function SuperAdminConsolePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{
    status: string;
    finished_at: string | null;
    rows_ops: number | null;
    rows_issue: number | null;
    rows_feedback: number | null;
    error: string | null;
  } | null>(null);

  const isSystemAdmin = profile?.role === 'system_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const isCountryAdmin = profile?.role === 'country_admin';
  const hasAccess = isSystemAdmin || isSuperAdmin || isCountryAdmin;

  useEffect(() => {
    if (!isSystemAdmin) return;
    supabase
      .from('sheet_export_log')
      .select('status, finished_at, rows_ops, rows_issue, rows_feedback, error')
      .order('started_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setLastExport(data[0]);
      });
  }, [isSystemAdmin]);

  if (!hasAccess) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" />
        <div className="p-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                You don't have permission to access this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const pageTitle = isSystemAdmin
    ? 'System Admin Console'
    : isSuperAdmin
    ? 'Super Admin Console'
    : `${profile?.country || ''} Console`;

  const menuItems = [
    {
      label: 'Manage Workshops',
      description: 'Create, edit, and manage workshops and their teams',
      icon: Building2,
      path: '/console/workshops',
      visible: true,
    },
    {
      label: 'Manage Users',
      description: 'Manage system and country-level administrator roles',
      icon: ShieldCheck,
      path: '/console/admins',
      visible: isSuperAdmin || isSystemAdmin,
    },
    {
      label: 'Manage System Configuration',
      description: isSystemAdmin
        ? 'Feature flag toggles (SMS, OCR, Feedback, Spares)'
        : 'Manage service categories & feedback forms',
      icon: Settings,
      path: '/console/system-config',
      visible: isSystemAdmin || isSuperAdmin,
    },
  ];

  const handleExportSheets = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-to-sheets');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Exported: ${data.data_ops_rows} ops, ${data.data_issue_rows} issue, ${data.data_feedback_rows} feedback rows`
      );
      setLastExport({
        status: 'DONE',
        finished_at: new Date().toISOString(),
        rows_ops: data.data_ops_rows,
        rows_issue: data.data_issue_rows,
        rows_feedback: data.data_feedback_rows,
        error: null,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const formatLastRun = () => {
    if (!lastExport?.finished_at) return null;
    const d = new Date(lastExport.finished_at);
    return d.toLocaleString();
  };

  return (
    <AppLayout>
      <PageHeader title={pageTitle} />
      <div className="p-4 space-y-3">
        {menuItems
          .filter((item) => item.visible)
          .map((item) => (
            <Card
              key={item.path}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{item.label}</h3>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}

        {isSystemAdmin && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <Sheet className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">Export to Google Sheets</h3>
                  <p className="text-xs text-muted-foreground">Push ops, issue & feedback data to Sheets</p>
                </div>
                <Button size="sm" onClick={handleExportSheets} disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Export'}
                </Button>
              </div>
              {lastExport && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-14">
                  {lastExport.status === 'DONE' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  )}
                  <span>
                    {lastExport.status === 'DONE'
                      ? `Last export: ${formatLastRun()} — ${lastExport.rows_ops ?? 0} ops, ${lastExport.rows_issue ?? 0} issue, ${lastExport.rows_feedback ?? 0} feedback`
                      : `Last export failed: ${lastExport.error || 'Unknown error'} (${formatLastRun()})`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
