import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Car, ChevronRight, FileText, X, ArrowUpDown, Building2 } from 'lucide-react';
import { JobCard, JobCardStatus, Workshop } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { WorkshopSelectorDialog } from '@/components/admin/WorkshopSelectorDialog';

type TabValue = 'draft' | 'ongoing' | 'completed';
type SortOption = 'newest' | 'oldest' | 'vehicle' | 'status';

const ITEMS_PER_PAGE = 10;

const TAB_STATUSES: Record<TabValue, JobCardStatus[]> = {
  draft: ['DRAFT'],
  ongoing: ['INWARDED', 'IN_PROGRESS', 'READY', 'REOPENED'],
  completed: ['DELIVERED', 'COMPLETED', 'CLOSED'],
};

export default function JobCardListPage() {
  const navigate = useNavigate();
  const { workshop, profile } = useAuth();


  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin';
  const isCountryAdmin = profile?.role === 'country_admin';
  const isElevatedAdmin = isSuperAdmin || isCountryAdmin;
  const [activeTab, setActiveTab] = useState<TabValue>('ongoing');
  const [searchQuery, setSearchQuery] = useState('');
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [workshops, setWorkshops] = useState<{ id: string; name: string }[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>('all');
  const [showWorkshopSelector, setShowWorkshopSelector] = useState(false);

  const handleCreateJobCard = () => {
    if (isElevatedAdmin) {
      setShowWorkshopSelector(true);
    } else {
      navigate('/create');
    }
  };

  const handleWorkshopSelected = (ws: Workshop) => {
    setShowWorkshopSelector(false);
    navigate('/create', { state: { selectedWorkshop: ws } });
  };

  // Fetch workshops list for elevated admin filter
  useEffect(() => {
    if (isElevatedAdmin) {
      let query = supabase.from('workshops').select('id, name').order('name');
      if (isCountryAdmin && profile?.country) {
        query = query.eq('country', profile.country);
      }
      query.then(({ data }) => {
        setWorkshops(data || []);
      });
    }
  }, [isElevatedAdmin, isCountryAdmin, profile?.country]);

  // Debounced search query for server-side search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (isElevatedAdmin || workshop?.id) {
      fetchJobCards();
    } else {
      setIsLoading(false);
    }
  }, [workshop?.id, activeTab, isElevatedAdmin, selectedWorkshopId, debouncedSearch]);

  const fetchJobCards = async () => {
    if (!isElevatedAdmin && !workshop?.id) return;
    
    setIsLoading(true);
    try {
      const isSearching = debouncedSearch.length >= 2;
      // When searching, query across all statuses; otherwise filter by active tab
      const statuses = isSearching
        ? [...TAB_STATUSES.draft, ...TAB_STATUSES.ongoing, ...TAB_STATUSES.completed]
        : TAB_STATUSES[activeTab];
      
      let query = supabase
        .from('job_cards')
        .select(`
          *,
          vehicle:vehicles(*),
          creator:profiles!job_cards_created_by_fkey(full_name),
          workshop:workshops(name)
        `)
        .in('status', statuses)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (isElevatedAdmin && selectedWorkshopId !== 'all') {
        query = query.eq('workshop_id', selectedWorkshopId);
      } else if (!isElevatedAdmin && workshop?.id) {
        query = query.eq('workshop_id', workshop.id);
      }

      // Server-side search by JC number
      if (isSearching) {
        query = query.ilike('jc_number', `%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Type cast the data
      const typedData = (data || []).map((item: any) => ({
        ...item,
        status: item.status as JobCardStatus,
        vehicle: item.vehicle,
        creator: item.creator,
      })) as JobCard[];
      
      setJobCards(typedData);
    } catch (error) {
      console.error('Error fetching job cards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const filteredAndSortedJobCards = useMemo(() => {
    let result = jobCards.filter((jc) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      // Client-side secondary filter for vehicle/owner (JC number already filtered server-side)
      return (
        jc.vehicle?.reg_no?.toLowerCase().includes(query) ||
        jc.jc_number.toLowerCase().includes(query) ||
        jc.vehicle?.owner_name?.toLowerCase().includes(query)
      );
    });

    // Sort
    switch (sortBy) {
      case 'oldest':
        result = [...result].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case 'vehicle':
        result = [...result].sort((a, b) => 
          (a.vehicle?.reg_no || '').localeCompare(b.vehicle?.reg_no || '')
        );
        break;
      case 'status':
        result = [...result].sort((a, b) => a.status.localeCompare(b.status));
        break;
      case 'newest':
      default:
        result = [...result].sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }

    return result;
  }, [jobCards, searchQuery, sortBy]);

  const totalPages = Math.ceil(filteredAndSortedJobCards.length / ITEMS_PER_PAGE);
  const paginatedJobCards = filteredAndSortedJobCards.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Warranty admins land on the approvals page instead
  if (profile?.role === 'warranty_admin') {
    return <Navigate to="/warranty-approvals" replace />;
  }

  return (
    <AppLayout>
      <PageHeader 
        title="Aftersales Platform"
        rightAction={
          <Button 
            size="icon" 
            className="h-9 w-9"
            onClick={handleCreateJobCard}
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />
      
      <div className="p-4 space-y-4">
        {/* Search and Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vehicles, JC number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-8 h-11"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[110px] h-11">
              <ArrowUpDown className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="vehicle">Vehicle</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Workshop Filter for Elevated Admin */}
        {isElevatedAdmin && workshops.length > 0 && (
          <Select value={selectedWorkshopId} onValueChange={setSelectedWorkshopId}>
            <SelectTrigger className="h-11">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by workshop" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isCountryAdmin ? `${profile?.country} Workshops` : 'All Workshops'}</SelectItem>
              {workshops.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList className="w-full grid grid-cols-3 h-11">
            <TabsTrigger value="draft" className="text-sm">
              Draft
            </TabsTrigger>
            <TabsTrigger value="ongoing" className="text-sm">
              Ongoing
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-sm">
              Completed
            </TabsTrigger>
          </TabsList>

          {['draft', 'ongoing', 'completed'].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : !workshop && !isElevatedAdmin ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">
                      No workshop assigned
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Contact your administrator to get assigned to a workshop
                    </p>
                  </CardContent>
                </Card>
              ) : paginatedJobCards.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">
                      {searchQuery ? 'No matching job cards' : 'No job cards yet'}
                    </p>
                    {tab === 'draft' && !searchQuery && (
                      <Button 
                        className="mt-4" 
                        onClick={handleCreateJobCard}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Job Card
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {paginatedJobCards.map((jc) => (
                    <JobCardListItem 
                      key={jc.id} 
                      jobCard={jc}
                      onClick={() => navigate(`/job-card/${jc.id}`)}
                      showWorkshop={isElevatedAdmin}
                    />
                  ))}
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <WorkshopSelectorDialog
        open={showWorkshopSelector}
        onOpenChange={setShowWorkshopSelector}
        onSelect={handleWorkshopSelected}
        title="Select Workshop"
        description="Choose the workshop for this job card"
      />
    </AppLayout>
  );
}

interface JobCardListItemProps {
  jobCard: JobCard;
  onClick: () => void;
  showWorkshop?: boolean;
}

function JobCardListItem({ jobCard, onClick, showWorkshop }: JobCardListItemProps) {
  const vehicle = jobCard.vehicle;
  const timeAgo = formatDistanceToNow(new Date(jobCard.updated_at), { addSuffix: true });
  const workshopName = (jobCard as any).workshop?.name;

  // Line 2 segments with truncation priority
  const name = vehicle?.owner_name;
  const model = vehicle?.model;
  const color = vehicle?.color;
  const workshop = showWorkshop ? workshopName : undefined;

  type Seg = { value: string; shrink: boolean };
  const line2Segs: Seg[] = [];
  if (name) line2Segs.push({ value: name, shrink: true });
  if (model) line2Segs.push({ value: model, shrink: false });
  if (color) line2Segs.push({ value: color, shrink: false });
  if (workshop) line2Segs.push({ value: workshop, shrink: true });

  const line3Parts = [jobCard.jc_number, timeAgo].filter(Boolean);

  return (
    <Card 
      className="cursor-pointer hover:bg-accent/50 transition-colors active:bg-accent"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Top row: Vehicle Reg + Status + Chevron */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Car className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-base truncate">
              {vehicle?.reg_no || 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusPill status={jobCard.status} />
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        {/* Line 2: Name · Model · Colour · Workshop */}
        {line2Segs.length > 0 && (
          <div className="flex items-center text-xs text-muted-foreground mt-1 whitespace-nowrap overflow-hidden min-w-0">
            {line2Segs.map((seg, i) => (
              <span key={i} className={`flex items-center ${seg.shrink ? 'min-w-0 shrink' : 'shrink-0'}`}>
                {i > 0 && <span className="shrink-0 mx-2 text-[1.25em] leading-none opacity-90">·</span>}
                <span className={seg.shrink ? 'truncate' : ''}>
                  {seg.value}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Line 3: JC Number · time elapsed */}
        <p className="text-xs text-muted-foreground mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
          {line3Parts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="text-[1.25em] leading-none opacity-90 mx-2">·</span>}
              {part}
            </span>
          ))}
        </p>
      </CardContent>
    </Card>
  );
}
