import { useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, MessageSquare, AlertCircle } from 'lucide-react';
import { JobCardSpare, SpareAction } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';
import { respondToNeedsInfo, fetchSpareActions } from '@/hooks/useWarrantyApprovals';
import { format } from 'date-fns';
import { useEffect } from 'react';

interface NeedsInfoResponseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spare: JobCardSpare;
  jobCardId: string;
  profileId: string;
  userId: string;
  onResponded: () => void;
}

export function NeedsInfoResponseSheet({
  open, onOpenChange, spare, jobCardId, profileId, userId, onResponded,
}: NeedsInfoResponseSheetProps) {
  const [responseComment, setResponseComment] = useState('');
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actions, setActions] = useState<SpareAction[]>([]);

  useEffect(() => {
    if (open && spare.id) {
      fetchSpareActions(spare.id).then(setActions);
    }
  }, [open, spare.id]);

  // Find the latest REQUEST_INFO action
  const latestRequest = [...actions].reverse().find(a => a.action_type === 'REQUEST_INFO');

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setNewPhotos(prev => [...prev, file]);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!responseComment.trim()) {
      toast.error('Response comment is required');
      return;
    }
    setSubmitting(true);
    try {
      // Upload additional photos if any
      for (const file of newPhotos) {
        const fileId = crypto.randomUUID();
        const path = `job_cards/${jobCardId}/spares/${spare.id}/OLD_PART_EVIDENCE/${fileId}.jpg`;
        let compressed: File;
        try { compressed = await compressImage(file); } catch { compressed = file; }
        
        await supabase.storage.from('spare-photos').upload(path, compressed);
        await supabase.from('job_card_spare_photos' as any).insert({
          job_card_spare_id: spare.id,
          photo_url: path,
          photo_kind: 'OLD_PART_EVIDENCE',
          uploaded_by: profileId,
          is_required: false,
          prompt: 'Additional evidence',
        } as any);
      }

      // Respond and resubmit
      await respondToNeedsInfo(spare.id, userId, responseComment.trim());
      
      toast.success('Response sent and claim resubmitted');
      setResponseComment('');
      setNewPhotos([]);
      onResponded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to respond');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Respond to Info Request
          </DrawerTitle>
          <DrawerDescription>
            {spare.spare_part?.part_name || 'Unknown Part'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          {/* Admin's request comment */}
          {latestRequest && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-orange-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Admin Request
              </div>
              <p className="text-sm">{latestRequest.comment}</p>
              <p className="text-[10px] text-orange-600">
                {latestRequest.actor?.full_name} • {format(new Date(latestRequest.created_at), 'MMM d, h:mm a')}
              </p>
            </div>
          )}

          {/* Response comment */}
          <div className="space-y-1.5">
            <Label htmlFor="response">Your Response *</Label>
            <Textarea
              id="response"
              placeholder="Provide the requested information..."
              value={responseComment}
              onChange={e => setResponseComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Additional photos */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Additional Evidence Photos (optional)
            </Label>
            {newPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {newPhotos.map((file, i) => (
                  <div key={i} className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                    <img src={URL.createObjectURL(file)} alt="New" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            <Input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="h-9" />
          </div>
        </div>

        <DrawerFooter>
          <Button onClick={handleSubmit} disabled={!responseComment.trim() || submitting}>
            {submitting ? 'Sending...' : 'Send Response & Resubmit'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
