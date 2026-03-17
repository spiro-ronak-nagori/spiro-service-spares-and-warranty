import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Car, User, Phone, Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { JobCard } from '@/types';

interface VehicleDetailsCardProps {
  vehicle: JobCard['vehicle'];
  jobCard: JobCard;
}

export function VehicleDetailsCard({ vehicle, jobCard }: VehicleDetailsCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const subtitle = [vehicle?.reg_no, vehicle?.model].filter(Boolean).join(' · ') || 'No vehicle info';

  return (
    <Card>
      <CardHeader className={isExpanded ? "pb-0" : ""}>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle Details
            </CardTitle>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{subtitle}</p>
            )}
          </div>
          <div className="shrink-0 ml-2 text-muted-foreground self-start mt-1">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Registration</span>
              <p className="font-medium">{vehicle?.reg_no || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Model</span>
              <p className="font-medium">{vehicle?.model || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Color</span>
              <p className="font-medium">{vehicle?.color || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Odometer</span>
              <p className="font-medium flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                {jobCard.odometer.toLocaleString()} km
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{vehicle?.owner_name || 'Unknown'}</span>
              <span className="text-xs text-muted-foreground">(Owner)</span>
            </div>
            {vehicle?.owner_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${vehicle.owner_phone}`} className="text-primary hover:underline">
                  {vehicle.owner_phone}
                </a>
              </div>
            )}

            {(jobCard as any).contact_for_updates === 'RIDER' && (jobCard as any).rider_name && (
              <>
                <Separator className="my-2" />
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-medium">{(jobCard as any).rider_name}</span>
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Rider — OTP & Updates</span>
                </div>
                {(jobCard as any).rider_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-primary" />
                    <a href={`tel:${(jobCard as any).rider_phone}`} className="text-primary hover:underline">
                      {(jobCard as any).rider_phone}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
