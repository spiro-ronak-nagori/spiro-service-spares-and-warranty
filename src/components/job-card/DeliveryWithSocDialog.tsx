import { useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Battery, AlertCircle, CheckCircle2 } from 'lucide-react';
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

const SOC_MISMATCH_THRESHOLD = 0.15;

export function DeliveryWithSocDialog({
  open,
  onOpenChange,
  onProceed,
}: DeliveryWithSocDialogProps) {
  const { value: ocrEnabled } = useSystemSetting('ENABLE_IMAGE_OCR', true);

  const [socValue, setSocValue] = useState('');
  const [socFile, setSocFile] = useState<File | null>(null);
  const [socValidation, setSocValidation] = useState<SocValidationResult | null>(null);
  const [ocrSocReading, setOcrSocReading] = useState<number | null>(null);
  const [socMismatchConfirmed, setSocMismatchConfirmed] = useState(false);
  const [socMismatchReason, setSocMismatchReason] = useState<string | undefined>();

  const handleSocValidation = (
    file: File | null,
    result: SocValidationResult | null,
  ) => {
    setSocFile(file);
    setSocValidation(result);
    setSocMismatchConfirmed(false);
    setSocMismatchReason(undefined);

    if (!file) {
      setSocValue('');
      setOcrSocReading(null);
      return;
    }

    // Pre-fill SOC from OCR
    if (result?.ocr?.socReading !== null && result?.ocr?.socReading !== undefined) {
      setSocValue(String(Math.round(result.ocr.socReading)));
      setOcrSocReading(result.ocr.socReading);
    } else {
      setOcrSocReading(null);
    }
  };

  // Compute mismatch
  const socMismatch = (() => {
    if (ocrSocReading === null || socValue === '') return null;
    const enteredVal = parseInt(socValue);
    if (isNaN(enteredVal) || enteredVal < 0 || enteredVal > 100) return null;
    const diff = Math.abs(ocrSocReading - enteredVal);
    const percentage = diff / Math.max(enteredVal, 1);
    return {
      hasMismatch: percentage > SOC_MISMATCH_THRESHOLD,
      percentage: percentage * 100,
      enteredValue: enteredVal,
      ocrValue: ocrSocReading,
    };
  })();

  const isSocValid = (): boolean => {
    const val = parseInt(socValue);
    if (isNaN(val) || val < 0 || val > 100) return false;
    if (!socFile) return false;
    if (!socValidation) return false;
    if (!socValidation.quality?.passed) return false;
    if (socValidation.error) return false;
    if (ocrEnabled) {
      if (!socValidation.ocr?.dashboardDetected) return false;
      if (socMismatch?.hasMismatch && !socMismatchConfirmed) return false;
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
    });
    resetState();
  };

  const resetState = () => {
    setSocValue('');
    setSocFile(null);
    setSocValidation(null);
    setOcrSocReading(null);
    setSocMismatchConfirmed(false);
    setSocMismatchReason(undefined);
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
          {/* Photo-first: capture dashboard photo */}
          <SocPhotoCapture
            onValidationComplete={handleSocValidation}
            ocrEnabled={ocrEnabled}
            direction="outgoing"
          />

          {/* SOC input: show after photo is captured */}
          {socFile && (
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
                  setSocMismatchConfirmed(false);
                  setSocMismatchReason(undefined);
                }}
                className="h-11"
              />
              {ocrSocReading !== null && (
                <p className="text-xs text-muted-foreground">
                  OCR reading: {ocrSocReading}%
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Edit the value if needed (0–100)
              </p>

              {/* Inline mismatch warning */}
              {socMismatch?.hasMismatch && !socMismatchConfirmed && (
                <div className="p-3 rounded-lg border-2 border-warning bg-warning/5 space-y-3">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      SOC value differs from photo by {socMismatch.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-2 bg-muted rounded">
                    <div>
                      <p className="text-xs text-muted-foreground">You entered</p>
                      <p className="text-sm font-bold">{socMismatch.enteredValue}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Photo shows</p>
                      <p className="text-sm font-bold">{socMismatch.ocrValue}%</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="out-soc-mismatch-reason" className="text-xs">
                      Explain the discrepancy <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="out-soc-mismatch-reason"
                      placeholder="e.g., Display reflection, SOC fluctuating..."
                      value={socMismatchReason || ''}
                      onChange={(e) => setSocMismatchReason(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!socMismatchReason || socMismatchReason.trim().length < 10}
                    onClick={() => setSocMismatchConfirmed(true)}
                  >
                    Confirm Value
                  </Button>
                  {socMismatchReason && socMismatchReason.trim().length > 0 && socMismatchReason.trim().length < 10 && (
                    <p className="text-xs text-destructive">Minimum 10 characters required</p>
                  )}
                </div>
              )}

              {socMismatch?.hasMismatch && socMismatchConfirmed && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-success/10 border border-success/30">
                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                  <span className="text-xs text-success font-medium">
                    Mismatch confirmed with reason
                  </span>
                </div>
              )}
            </div>
          )}
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
