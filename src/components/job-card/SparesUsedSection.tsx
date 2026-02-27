import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Camera } from 'lucide-react';
import { JobCardSpare, SparePhotoKind } from '@/types';

interface SparesUsedSectionProps {
  spares: JobCardSpare[];
  isLoading: boolean;
}

const CLAIM_LABEL: Record<string, string> = {
  USER_PAID: 'User Paid',
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
};

const PHOTO_KIND_LABEL: Record<SparePhotoKind, string> = {
  NEW_PART_PROOF: 'New Part Proof',
  OLD_PART_EVIDENCE: 'Old Part Evidence',
  ADDITIONAL: 'Additional',
};

export function SparesUsedSection({ spares, isLoading }: SparesUsedSectionProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Spares Used
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (spares.length === 0) return null;

  const groupPhotos = (photos: JobCardSpare['photos']) => {
    const groups: Record<string, typeof photos> = {};
    (photos || []).forEach(p => {
      if (!groups[p.photo_kind]) groups[p.photo_kind] = [];
      groups[p.photo_kind]!.push(p);
    });
    return groups;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Spares Used
          <Badge variant="secondary" className="text-xs">{spares.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {spares.map((spare, idx) => {
          const photoGroups = groupPhotos(spare.photos);
          return (
            <div key={spare.id}>
              {idx > 0 && <Separator className="mb-3" />}
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {spare.spare_part?.part_name || 'Unknown Part'}
                    </p>
                    {spare.spare_part?.part_code && (
                      <p className="text-xs text-muted-foreground">{spare.spare_part.part_code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Qty: {spare.qty}
                    </Badge>
                    <Badge
                      variant={spare.claim_type === 'USER_PAID' ? 'secondary' : 'default'}
                      className="text-xs"
                    >
                      {CLAIM_LABEL[spare.claim_type]}
                    </Badge>
                  </div>
                </div>

                {/* Serial number only */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {spare.serial_number && <span>Part Serial#: {spare.serial_number}</span>}
                </div>

                {spare.technician_comment && (
                  <p className="text-xs text-muted-foreground italic">"{spare.technician_comment}"</p>
                )}

                {/* Photos grouped by kind */}
                {Object.entries(photoGroups).map(([kind, photos]) => (
                  <div key={kind} className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      {PHOTO_KIND_LABEL[kind as SparePhotoKind] || kind}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {(photos || []).map(photo => (
                        <a
                          key={photo.id}
                          href={photo.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-16 h-16 rounded-md overflow-hidden border bg-muted"
                        >
                          <img
                            src={photo.photo_url}
                            alt={photo.description_prompt || 'Spare photo'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
