import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function ShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) { setError(true); return; }

    (async () => {
      try {
        // Use edge function to resolve short code (bypasses RLS for public access)
        const { data, error: err } = await supabase.functions.invoke('load-feedback', {
          body: { short_code: code },
        });

        if (err || data?.error || !data?.token) { setError(true); return; }

        navigate(`/feedback/${data.token}`, { replace: true });
      } catch {
        setError(true);
      }
    })();
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Invalid link</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}
