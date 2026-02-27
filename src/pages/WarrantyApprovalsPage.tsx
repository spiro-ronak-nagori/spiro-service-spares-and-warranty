import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApprovalQueueList } from '@/components/warranty/ApprovalQueueList';
import { ApprovalDetailView } from '@/components/warranty/ApprovalDetailView';
import { ApprovalQueueItem } from '@/hooks/useWarrantyApprovals';

export default function WarrantyApprovalsPage() {
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<ApprovalQueueItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
