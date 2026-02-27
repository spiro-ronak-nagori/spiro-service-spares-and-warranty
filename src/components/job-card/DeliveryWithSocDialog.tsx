import { useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Battery } from 'lucide-react';
import { SocPhotoCapture } from '@/components/job-card/SocPhotoCapture';
import { SocValidationResult } from '@/hooks/useSocValidation';
import { useSystemSetting } from '@/hooks/useSystemSetting';

export interface OutgoingSocData {
  value: number;
  file: File;
  validation: SocValidationResult | null;
  mismatchConfirmed: boolean;
  mismatchReason?: string;
  mismatchComment?: string;
}

interface DeliveryWithSocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: (socData: OutgoingSocData) => void;
}

export function DeliveryWithSocDialog({
  open,
  onOpenChange,
  onProceed,
}: DeliveryWithSocDialogProps) {
  const { value: ocrEnabled } = useSystemSetting('ENABLE_IMAGE_OCR', true);

  const [socValue, setSocValue] = useState('');
  const [socFile, setSocFile] = useState<File | null>(null);
  const [socValidation, setSocValidation] = useState<SocValidationResult | null>(null);
  const [socMismatchConfirmed, setSocMismatchConfirmed] = useState(false);
  const [socMismatchReason, setSocMismatchReason] = useState<string | undefined>();
  const [socMismatchComment, setSocMismatchComment] = useState<string | undefined>();

  const handleSocValidation = (
    file: File | null,
    result: SocValidationResult | null,
    mismatchConfirmed: boolean,
    mismatchReason?: string,
    mismatchComment?: string
  ) => {
    setSocFile(file);
    setSocValidation(result);
    setSocMismatchConfirmed(mismatchConfirmed);
    setSocMismatchReason(mismatchReason);
    setSocMismatchComment(mismatchComment);
  };

  const isSocValid = (): boolean => {
    const val = parseInt(socValue);
    if (isNaN(val) || val < 0 || val > 100) return false;
    if (!socFile) return false;
    if (!socValidation) return false;
    if (!socValidation.quality?.passed) return false;
    if (socValidation.error) return false;
    if (ocrEnabled) {
      if (!socValidation.ocr?.dashboardDetected) return false;
      if (socValidation.mismatch?.hasMismatch && !socMismatchConfirmed) return false;
    }
    return true;
  };

  const handleProceed = () => {
    if (!isSocValid() || !socFile) return;
    onProceed({
      value: parseInt(socValue),
      file: socFile,
      validation: socValidation,
      mismatchConfirmed: socMismatchConfirmed,
      mismatchReason: socMismatchReason,
      mismatchComment: socMismatchComment,
    });
    resetState();
  };

  const resetState = () => {
    setSocValue('');
    setSocFile(null);
    setSocValidation(null);
    setSocMismatchConfirmed(false);
    setSocMismatchReason(undefined);
    setSocMismatchComment(undefined);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader>
          <DrawerTitle>Delivery Verification</DrawerTitle>
          <DrawerDescription>
            Capture the outgoing SOC before proceeding to OTP verification.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Outgoing SOC value */}
          <div className="space-y-2">
            <Label htmlFor="out-soc-value" className="flex items-center gap-2">
              <Battery className="h-4 w-4" />
              Outgoing SOC (%) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="out-soc-value"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="e.g. 85"
              value={socValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= 100)) {
                  setSocValue(v);
                }
              }}
              className="h-11"
            />
          </div>

          {/* SOC Photo Capture */}
          <SocPhotoCapture
            enteredSoc={socValue ? parseInt(socValue) : -1}
            onValidationComplete={handleSocValidation}
            ocrEnabled={ocrEnabled}
            direction="outgoing"
          />
        </div>

        <DrawerFooter className="safe-bottom">
          <Button onClick={handleProceed} disabled={!isSocValid()} className="h-12">
            Proceed to OTP
          </Button>
          <Button variant="outline" onClick={handleClose} className="h-12">
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
