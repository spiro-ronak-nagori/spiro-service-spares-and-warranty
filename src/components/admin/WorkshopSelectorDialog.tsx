import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Search, MapPin, Check, X } from 'lucide-react';
import { Workshop } from '@/types';

interface WorkshopSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (workshop: Workshop) => void;
  title?: string;
  description?: string;
}

export function WorkshopSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  title = 'Select Workshop',
  description = 'Choose a workshop to continue',
}: WorkshopSelectorDialogProps) {
  const { profile } = useAuth();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isSuperAdmin = profile?.role === 'super_admin';
  const isCountryAdmin = profile?.role === 'country_admin';

  useEffect(() => {
    if (open) {
      fetchWorkshops();
      setSearch('');
    }
  }, [open]);

  const fetchWorkshops = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('workshops').select('*').order('name');
      if (isCountryAdmin && profile?.country) {
        query = query.eq('country', profile.country);
      }
      const { data, error } = await query;
      if (error) throw error;
      setWorkshops(
        (data || []).map((w: any) => ({
          ...w,
          type: w.type as Workshop['type'],
          grade: w.grade as Workshop['grade'],
        }))
      );
    } catch (err) {
      console.error('Error fetching workshops:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return workshops;
    const q = search.toLowerCase();
    return workshops.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.city?.toLowerCase().includes(q) ||
        w.country?.toLowerCase().includes(q)
    );
  }, [workshops, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workshops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-8 h-10"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh]">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No matching workshops' : 'No workshops available'}
            </p>
          ) : (
            filtered.map((w) => (
              <Card
                key={w.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors active:bg-accent"
                onClick={() => onSelect(w)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[w.city, w.country].filter(Boolean).join(', ') || 'No location'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
