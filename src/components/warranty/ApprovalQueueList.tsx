import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Clock, CheckCircle2, ChevronRight, Car, Building2, User, Package,
} from 'lucide-react';
import {
  useWarrantyApprovalQueue, useAdminScopeWorkshops,
  ApprovalQueueItem, TatBucket, getTatBucket, formatTat,
} from '@/hooks/useWarrantyApprovals';

const CLAIM_LABEL: Record<string, string> = { WARRANTY: 'Warranty', GOODWILL: 'Goodwill' };
const CLAIM_COLORS: Record<string, string> = {
  WARRANTY: 'bg-blue-100 text-blue-800 border-blue-200',
  GOODWILL: 'bg-pink-100 text-pink-800 border-pink-200',
};

const TAT_COLORS: Record<string, string> = {
  '<4h': 'bg-green-100 text-green-800',
  '4-12h': 'bg-amber-100 text-amber-800',
  '12-24h': 'bg-orange-100 text-orange-800',
  '>24h': 'bg-red-100 text-red-800',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'RESUBMITTED', label: 'Resubmitted' },
  { value: 'NEEDS_INFO', label: 'More Info' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'WARRANTY', label: 'Warranty' },
  { value: 'GOODWILL', label: 'Goodwill' },
];

const APPROVAL_STATE_PILL: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'Submitted', className: 'bg-green-100 text-green-800' },
  RESUBMITTED: { label: 'Resubmitted', className: 'bg-blue-100 text-blue-800' },
  NEEDS_INFO: { label: 'Needs Info', className: 'bg-orange-100 text-orange-800' },
  APPROVED: { label: 'Approved', className: 'bg-green-600 text-white' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
};

interface ApprovalQueueListProps {
  onSelectItem: (item: ApprovalQueueItem) => void;
}

export function ApprovalQueueList({ onSelectItem }: ApprovalQueueListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [tatFilter, setTatFilter] = useState<TatBucket | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [workshopFilter, setWorkshopFilter] = useState('all');

  const workshops = useAdminScopeWorkshops();

  const { items, bucketCounts, isLoading } = useWarrantyApprovalQueue({
    status: statusFilter,
    search: search.trim() || undefined,
    workshopId: workshopFilter !== 'all' ? workshopFilter : undefined,
    claimType: typeFilter !== 'all' ? typeFilter : undefined,
    tatBucket: tatFilter,
  });

  const totalCount = Object.values(bucketCounts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="p-4 space-y-4">
      {/* TAT Bucket Chips — act as filters */}
      <div className="flex gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={`text-xs cursor-pointer border-0 ${tatFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          onClick={() => setTatFilter('all')}
        >
          All: {totalCount}
        </Badge>
        {(['<4h', '4-12h', '12-24h', '>24h'] as const).map(bucket => (
          <Badge
            key={bucket}
            variant="outline"
            className={`text-xs cursor-pointer border-0 ${tatFilter === bucket ? 'ring-2 ring-primary' : ''} ${TAT_COLORS[bucket]}`}
            onClick={() => setTatFilter(tatFilter === bucket ? 'all' : bucket)}
          >
            {bucket}: {bucketCounts[bucket] || 0}
          </Badge>
        ))}
      </div>

      {/* Search + Status + Workshop filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search JC#, Reg No, Part, Workshop..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className={`grid gap-2 ${workshops.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {workshops.length > 0 && (
            <Select value={workshopFilter} onValueChange={setWorkshopFilter}>
              <SelectTrigger className="h-9 min-w-0">
                <SelectValue placeholder="All Workshops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workshops</SelectItem>
                {workshops.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Queue List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No items found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const tatBucket = getTatBucket(item.tat_minutes);
            const statePill = APPROVAL_STATE_PILL[item.spare.approval_state];
            return (
              <Card
                key={item.spare.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => onSelectItem(item)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{item.jc_number}</span>
                        <Badge variant="outline" className={`text-[10px] h-5 ${CLAIM_COLORS[item.spare.claim_type] || ''}`}>
                          {CLAIM_LABEL[item.spare.claim_type]}
                        </Badge>
                        {statePill && (
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statePill.className}`}>
                            {statePill.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        <Package className="h-3 w-3 inline mr-0.5" />
                        {item.spare.spare_part?.part_name} × {item.spare.qty}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {item.vehicle_reg_no}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {item.workshop_name}
                        </span>
                        {item.technician_name !== '—' && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {item.technician_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[10px] h-5 border-0 ${TAT_COLORS[tatBucket]}`}>
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {formatTat(item.tat_minutes)}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
