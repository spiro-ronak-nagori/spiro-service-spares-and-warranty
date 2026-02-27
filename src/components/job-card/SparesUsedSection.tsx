import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Package, Camera, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { JobCardSpare, SparePhotoKind } from '@/types';

interface SparesUsedSectionProps {
  spares: JobCardSpare[];
  isLoading: boolean;
  onAddSpares?: () => void;
  onEditSpare?: (spare: JobCardSpare) => void;
  onDeleteSpare?: (spareId: string) => void;
  canEdit?: boolean;
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

function DocsIndicator({ spare }: { spare: JobCardSpare }) {
  const part = spare.spare_part;
  if (!part) return null;

  const indicators: React.ReactNode[] = [];

  // Photo indicator
  const proofPhotos = (spare.photos || []).filter(p => p.photo_kind === 'NEW_PART_PROOF');
  const reqCount = part.usage_proof_photos_required_count;
  if (reqCount > 0) {
    const complete = proofPhotos.length >= reqCount;
    indicators.push(
      <span key="photos" className={`text-[10px] flex items-center gap-0.5 ${complete ? 'text-green-600' : 'text-destructive'}`}>
        <Camera className="h-2.5 w-2.5" />
        {proofPhotos.length}/{reqCount}
      </span>
    );
  }

  // Serial indicator
  if (part.serial_required) {
    indicators.push(
      <span key="serial" className={`text-[10px] flex items-center gap-0.5 ${spare.serial_number ? 'text-green-600' : 'text-destructive'}`}>
        {spare.serial_number ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        Serial
      </span>
    );
  }

  if (indicators.length === 0) return null;
  return <div className="flex items-center gap-2">{indicators}</div>;
}

export function SparesUsedSection({ spares, isLoading, onAddSpares, onEditSpare, onDeleteSpare, canEdit }: SparesUsedSectionProps) {
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

  return (
    <Card id="spares-used-section">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Spares Used
            {spares.length > 0 && (
              <Badge variant="secondary" className="text-xs">{spares.length}</Badge>
            )}
          </CardTitle>
          {canEdit && onAddSpares && (
            <Button variant="outline" size="sm" onClick={onAddSpares} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Spares
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {spares.length === 0 ? (
          <div className="text-center py-4">
            <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No spares recorded yet.</p>
            {canEdit && onAddSpares && (
              <Button variant="default" size="sm" onClick={onAddSpares} className="mt-3">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Spares
              </Button>
            )}
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {spares.map((spare) => (
              <AccordionItem key={spare.id} value={spare.id}>
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {spare.spare_part?.part_name || 'Unknown Part'}
                        {spare.spare_part?.part_code && (
                          <span className="text-muted-foreground font-normal"> ({spare.spare_part.part_code})</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          Qty: {spare.qty}
                        </Badge>
                        <Badge
                          variant={spare.claim_type === 'USER_PAID' ? 'secondary' : 'default'}
                          className="text-[10px] h-5 px-1.5"
                        >
                          {CLAIM_LABEL[spare.claim_type]}
                        </Badge>
                        <DocsIndicator spare={spare} />
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-1">
                    {/* Serial Number */}
                    {spare.serial_number && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Part Serial#:</span>{' '}
                        <span className="font-medium">{spare.serial_number}</span>
                      </div>
                    )}

                    {/* Comment */}
                    {spare.technician_comment && (
                      <p className="text-xs text-muted-foreground italic">"{spare.technician_comment}"</p>
                    )}

                    {/* Photos grouped by kind */}
                    {(() => {
                      const groups: Record<string, typeof spare.photos> = {};
                      (spare.photos || []).forEach(p => {
                        if (!groups[p.photo_kind]) groups[p.photo_kind] = [];
                        groups[p.photo_kind]!.push(p);
                      });
                      return Object.entries(groups).map(([kind, photos]) => (
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
                      ));
                    })()}

                    {/* Edit / Delete buttons */}
                    {canEdit && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        {onEditSpare && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); onEditSpare(spare); }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        {onDeleteSpare && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDeleteSpare(spare.id); }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
