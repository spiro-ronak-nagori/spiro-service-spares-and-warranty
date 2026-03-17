import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRbacPermissions } from '@/hooks/useRbacPermissions';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ApprovalQueueList } from '@/components/warranty/ApprovalQueueList';
import { ApprovalDetailView } from '@/components/warranty/ApprovalDetailView';
import { ApprovalQueueItem } from '@/hooks/useWarrantyApprovals';

export default function WarrantyApprovalsPage() {
  const { user } = useAuth();
  const { can, isLoading } = useRbacPermissions();
  const [selectedItem, setSelectedItem] = useState<ApprovalQueueItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isLoading && !can('nav.warranty_approvals')) {
    return (
      <AppLayout>
        <PageHeader title="Access Denied" />
        <div className="p-4">
          <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">You don't have permission to access warranty approvals.</p></CardContent></Card>
        </div>
      </AppLayout>
    );
  }

  if (selectedItem) {
    return (
      <ApprovalDetailView
        item={selectedItem}
        actorUserId={user?.id || ''}
        onBack={() => { setSelectedItem(null); setRefreshKey(k => k + 1); }}
      />
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Warranty Approvals" />
      <ApprovalQueueList
        key={refreshKey}
        onSelectItem={setSelectedItem}
      />
    </AppLayout>
  );
}
