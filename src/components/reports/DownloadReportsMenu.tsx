import { useState } from 'react';
import { Download, FileText, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface DownloadReportsMenuProps {
  dateFrom: string;
  dateTo: string;
  countryId: string | null;
  workshopId: string | null;
}

export function DownloadReportsMenu({
  dateFrom,
  dateTo,
  countryId,
  workshopId,
}: DownloadReportsMenuProps) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  const isLoading = loadingPdf || loadingCsv;

  const handleExport = async (type: 'pdf' | 'csv') => {
    const setLoading = type === 'pdf' ? setLoadingPdf : setLoadingCsv;
    const fnName =
      type === 'pdf' ? 'reports-snapshot-pdf' : 'reports-raw-jobcards-csv';

    setLoading(true);
    setDrawerOpen(false);

    // Show a non-blocking toast so user can navigate
    const toastId = toast({
      title: `Preparing ${type === 'pdf' ? 'PDF' : 'CSV'} export...`,
      description: 'You can continue using the app.',
    });

    try {
      // Use fetch directly to get raw binary response (supabase.functions.invoke auto-parses JSON)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          country_id: countryId,
          workshop_id: workshopId,
        }),
      });

      if (!res.ok) {
        let body: any = null;
        try {
          body = await res.json();
        } catch { /* not JSON */ }

        if (body?.error === 'RATE_LIMITED') {
          toast({
            title: 'Please wait',
            description: 'Please retry download after 5 minutes.',
          });
          return;
        }
        if (body?.error === 'TOO_MANY_ROWS') {
          toast({
            title: 'Too many rows',
            description: body.message || 'Please narrow your filters and try again.',
            variant: 'destructive',
          });
          return;
        }
        if (body?.error?.includes?.('Forbidden') || body?.error?.includes?.('insufficient role')) {
          toast({
            title: 'Access denied',
            description: 'You do not have permission to export reports.',
            variant: 'destructive',
          });
          return;
        }
        throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      }

      const blob = await res.blob();


      // Trigger download
      const ext = type === 'pdf' ? 'pdf' : 'csv';
      const prefix = type === 'pdf' ? 'reports_snapshot' : 'jobcards';
      const filename = `${prefix}_${dateFrom}_${dateTo}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Delay cleanup to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      toast({ title: 'Download complete', description: filename });
    } catch (err: any) {
      console.error('Export error:', err);
      toast({
        title: 'Export failed',
        description: err.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const menuItems = (
    <>
      <button
        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted rounded-md disabled:opacity-50"
        onClick={() => handleExport('pdf')}
        disabled={isLoading}
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div className="text-left">
          <p className="font-medium">Report snapshot (PDF)</p>
          <p className="text-xs text-muted-foreground">
            KPIs, trends &amp; TAT summary
          </p>
        </div>
      </button>
      <button
        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted rounded-md disabled:opacity-50"
        onClick={() => handleExport('csv')}
        disabled={isLoading}
      >
        <Table className="h-4 w-4 text-muted-foreground" />
        <div className="text-left">
          <p className="font-medium">Raw job card data (CSV)</p>
          <p className="text-xs text-muted-foreground">
            Full job card export with filters applied
          </p>
        </div>
      </button>
    </>
  );

  const buttonContent = (
    <Button
      variant="outline"
      size={isMobile ? 'icon' : 'default'}
      disabled={isLoading}
      className="shrink-0 h-9"
    >
      <Download
        className={`h-4 w-4 ${isLoading ? 'animate-pulse' : ''}`}
      />
      {!isMobile && (
        <span className="ml-1.5">
          {isLoading ? 'Exporting…' : 'Download'}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>{buttonContent}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Download Reports</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1">{menuItems}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{buttonContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1">
        {menuItems}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
