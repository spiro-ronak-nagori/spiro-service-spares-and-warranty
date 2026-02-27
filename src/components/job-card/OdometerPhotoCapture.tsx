import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useOdometerValidation, ValidationResult } from '@/hooks/useOdometerValidation';
import { cn } from '@/lib/utils';

interface OdometerPhotoCaptureProps {
  enteredOdometer: number;
  onValidationComplete: (
    file: File | null,
    result: ValidationResult | null,
    mismatchConfirmed: boolean,
    mismatchReason?: string
  ) => void;
  disabled?: boolean;
  ocrEnabled?: boolean;
}

export function OdometerPhotoCapture({
  enteredOdometer,
  onValidationComplete,
  disabled = false,
  ocrEnabled = true,
}: OdometerPhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');

  const {
    quality,
    ocr,
    mismatch,
    isValidating,
    error,
    validateOdometer,
    reset,
  } = useOdometerValidation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Reset previous state
    reset();
    setMismatchReason('');

    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);

    setFile(selectedFile);

    // Run validation
    if (enteredOdometer > 0) {
      const result = await validateOdometer(selectedFile, enteredOdometer, ocrEnabled);
      
      // If there's a mismatch, show dialog
      if (result.mismatch?.hasMismatch && !result.error) {
        setShowMismatchDialog(true);
      } else {
        onValidationComplete(selectedFile, result, false);
      }
    }
  };

  const handleRetake = () => {
    setFile(null);
    setPreview(null);
    reset();
    setMismatchReason('');
    onValidationComplete(null, null, false);
    
    // Trigger file input
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleMismatchConfirm = () => {
    if (mismatchReason.trim().length < 10) return;
    
    setShowMismatchDialog(false);
    onValidationComplete(file, { quality, ocr, mismatch, isValidating, error }, true, mismatchReason);
  };

  const handleMismatchCancel = () => {
    setShowMismatchDialog(false);
    handleRetake();
  };

  const getStatusColor = () => {
    if (isValidating) return 'border-muted';
    if (error) return 'border-destructive';
    if (mismatch?.hasMismatch) return 'border-warning';
    if (isValid) return 'border-success';
    return 'border-muted';
  };

  const getStatusIcon = () => {
    if (isValidating) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    if (error) return <AlertCircle className="h-5 w-5 text-destructive" />;
    if (mismatch?.hasMismatch) return <AlertTriangle className="h-5 w-5 text-warning" />;
    if (isValid) return <CheckCircle2 className="h-5 w-5 text-success" />;
    return null;
  };

  const isValid = ocrEnabled
    ? (quality?.passed && ocr?.clusterDetected && !error)
    : (quality?.passed && !error);

  return (
    <div className="space-y-3">
      <Label>
        Odometer Photo <span className="text-destructive">*</span>
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isValidating}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || enteredOdometer <= 0}
          className={cn(
            'flex w-full items-center justify-center gap-2 h-24 border-2 border-dashed rounded-lg transition-colors',
            enteredOdometer <= 0
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:bg-muted/50'
          )}
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-muted-foreground">
            {enteredOdometer <= 0 ? 'Enter odometer value first' : 'Tap to capture odometer photo'}
          </span>
        </button>
      ) : (
        <div className={cn('rounded-lg border-2 p-3', getStatusColor())}>
          {/* Preview thumbnail */}
          <div className="flex items-start gap-3">
            {preview && (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="relative flex-shrink-0 w-20 h-20 rounded overflow-hidden bg-muted"
              >
                <img 
                  src={preview} 
                  alt="Odometer" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                  <Eye className="h-5 w-5 text-white" />
                </div>
              </button>
            )}

            <div className="flex-1 min-w-0">
              {/* Status */}
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon()}
                <span className="text-sm font-medium">
                  {isValidating && 'Validating...'}
                  {error && 'Validation Failed'}
                  {!isValidating && !error && mismatch?.hasMismatch && 'Value Mismatch'}
                  {!isValidating && !error && isValid && !mismatch?.hasMismatch && 'Validated'}
                </span>
              </div>

              {/* Details */}
              {isValidating && (
                <p className="text-xs text-muted-foreground">
                  Checking image quality and reading odometer...
                </p>
              )}

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              {!isValidating && !error && quality && (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={quality.passed ? 'text-success' : 'text-destructive'}>
                      {quality.passed ? '✓' : '✗'} Image quality
                    </span>
                    {!quality.passed && (
                      <span className="text-destructive">{quality.message}</span>
                    )}
                  </div>
                  
                  {ocr && (
                    <div className="flex items-center gap-2">
                      <span className={ocr.clusterDetected ? 'text-success' : 'text-destructive'}>
                        {ocr.clusterDetected ? '✓' : '✗'} Odometer detected
                      </span>
                      {ocr.ocrReading !== null && (
                        <span className="text-muted-foreground">
                          Read: {ocr.ocrReading.toLocaleString()} km ({ocr.ocrConfidence}% confident)
                        </span>
                      )}
                    </div>
                  )}

                  {mismatch && (
                    <div className="flex items-center gap-2">
                      <span className={!mismatch.hasMismatch ? 'text-success' : 'text-warning'}>
                        {!mismatch.hasMismatch ? '✓' : '⚠'} Value match
                      </span>
                      {mismatch.hasMismatch && (
                        <span className="text-warning">
                          {mismatch.percentage.toFixed(1)}% difference
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetake}
              disabled={isValidating}
              className="flex-shrink-0"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retake
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {ocrEnabled
          ? 'Photo is validated for quality and odometer reading is compared with entered value'
          : 'Photo captured for record-keeping (OCR validation is disabled)'}
      </p>

      {/* Full Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Odometer Photo</DialogTitle>
          </DialogHeader>
          {preview && (
            <img 
              src={preview} 
              alt="Odometer full preview" 
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Mismatch Confirmation Dialog */}
      <Dialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Odometer Value Mismatch
            </DialogTitle>
            <DialogDescription>
              The OCR reading differs from your entered value by more than 10%.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">You entered</p>
                <p className="text-lg font-bold">{mismatch?.enteredValue.toLocaleString()} km</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Photo shows</p>
                <p className="text-lg font-bold">{mismatch?.ocrValue.toLocaleString()} km</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mismatch-reason">
                Please explain the discrepancy <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="mismatch-reason"
                placeholder="e.g., Digital odometer shows partial digits, reflection causing misread..."
                value={mismatchReason}
                onChange={(e) => setMismatchReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              {mismatchReason.length > 0 && mismatchReason.length < 10 && (
                <p className="text-xs text-destructive">
                  Minimum 10 characters required
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleMismatchCancel}>
              Retake Photo
            </Button>
            <Button
              onClick={handleMismatchConfirm}
              disabled={mismatchReason.trim().length < 10}
            >
              Confirm & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
