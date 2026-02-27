import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useSocValidation, SocValidationResult } from '@/hooks/useSocValidation';
import { cn } from '@/lib/utils';

const MISMATCH_REASONS = [
  'Display reflection causing misread',
  'SOC fluctuating during charge/discharge',
  'Dashboard display partially obscured',
  'Aftermarket display showing different format',
  'Other',
] as const;

interface SocPhotoCaptureProps {
  enteredSoc: number;
  onValidationComplete: (
    file: File | null,
    result: SocValidationResult | null,
    mismatchConfirmed: boolean,
    mismatchReason?: string,
    mismatchComment?: string
  ) => void;
  disabled?: boolean;
  ocrEnabled?: boolean;
  /** 'incoming' (default) or 'outgoing' — changes labels only */
  direction?: 'incoming' | 'outgoing';
}

export function SocPhotoCapture({
  enteredSoc,
  onValidationComplete,
  disabled = false,
  ocrEnabled = true,
  direction = 'incoming',
}: SocPhotoCaptureProps) {
  const dirLabel = direction === 'outgoing' ? 'Outgoing SOC' : 'SOC';
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [mismatchComment, setMismatchComment] = useState('');

  const { quality, ocr, mismatch, isValidating, error, validateSoc, reset } = useSocValidation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    reset();
    setMismatchReason('');
    setMismatchComment('');

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selectedFile);
    setFile(selectedFile);

    if (enteredSoc >= 0) {
      const result = await validateSoc(selectedFile, enteredSoc, ocrEnabled);
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
    setMismatchComment('');
    onValidationComplete(null, null, false);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleMismatchConfirm = () => {
    if (!mismatchReason || mismatchComment.trim().length < 20) return;
    setShowMismatchDialog(false);
    onValidationComplete(
      file,
      { quality, ocr, mismatch, isValidating, error },
      true,
      mismatchReason,
      mismatchComment
    );
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
    ? (quality?.passed && ocr?.dashboardDetected && !error)
    : (quality?.passed && !error);
  const isSocEntered = enteredSoc >= 0 && enteredSoc <= 100;

  return (
    <div className="space-y-3">
      <Label>
        Dashboard Photo ({dirLabel}) <span className="text-destructive">*</span>
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
          disabled={disabled || !isSocEntered}
          className={cn(
            'flex w-full items-center justify-center gap-2 h-24 border-2 border-dashed rounded-lg transition-colors',
            !isSocEntered ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/50'
          )}
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-muted-foreground">
            {!isSocEntered ? 'Enter SOC value first' : 'Tap to capture dashboard photo'}
          </span>
        </button>
      ) : (
        <div className={cn('rounded-lg border-2 p-3', getStatusColor())}>
          <div className="flex items-start gap-3">
            {preview && (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="relative flex-shrink-0 w-20 h-20 rounded overflow-hidden bg-muted"
              >
                <img src={preview} alt="Dashboard" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                  <Eye className="h-5 w-5 text-white" />
                </div>
              </button>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon()}
                <span className="text-sm font-medium">
                  {isValidating && 'Validating...'}
                  {error && 'Validation Failed'}
                  {!isValidating && !error && mismatch?.hasMismatch && 'Value Mismatch'}
                  {!isValidating && !error && isValid && !mismatch?.hasMismatch && 'Validated'}
                </span>
              </div>

              {isValidating && (
                <p className="text-xs text-muted-foreground">Checking image quality and reading SOC...</p>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              {!isValidating && !error && quality && (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={quality.passed ? 'text-success' : 'text-destructive'}>
                      {quality.passed ? '✓' : '✗'} Image quality
                    </span>
                  </div>
                  {ocr && (
                    <div className="flex items-center gap-2">
                      <span className={ocr.dashboardDetected ? 'text-success' : 'text-destructive'}>
                        {ocr.dashboardDetected ? '✓' : '✗'} Dashboard detected
                      </span>
                      {ocr.socReading !== null && (
                        <span className="text-muted-foreground">
                          Read: {ocr.socReading}% ({ocr.confidence}% confident)
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
                        <span className="text-warning">{mismatch.percentage.toFixed(1)}% difference</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={handleRetake} disabled={isValidating} className="flex-shrink-0">
              <RefreshCw className="h-4 w-4 mr-1" />
              Retake
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {ocrEnabled
          ? 'Photo is validated for quality and SOC reading is compared with entered value'
          : 'Photo captured for record-keeping (OCR validation is disabled)'}
      </p>

      {/* Full Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dashboard Photo</DialogTitle>
          </DialogHeader>
          {preview && <img src={preview} alt="Dashboard full preview" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      {/* Mismatch Confirmation Dialog */}
      <Dialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              SOC Value Mismatch
            </DialogTitle>
            <DialogDescription>
              Detected SOC ({mismatch?.ocrValue}%) does not match entered SOC ({mismatch?.enteredValue}%). Difference exceeds ±15% tolerance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">You entered</p>
                <p className="text-lg font-bold">{mismatch?.enteredValue}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Photo shows</p>
                <p className="text-lg font-bold">{mismatch?.ocrValue}%</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="soc-mismatch-reason">
                Reason for discrepancy <span className="text-destructive">*</span>
              </Label>
              <Select value={mismatchReason} onValueChange={setMismatchReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {MISMATCH_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="soc-mismatch-comment">
                Additional details <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="soc-mismatch-comment"
                placeholder="Provide details about the discrepancy (min 20 characters)..."
                value={mismatchComment}
                onChange={(e) => setMismatchComment(e.target.value)}
                rows={3}
                className="resize-none"
              />
              {mismatchComment.length > 0 && mismatchComment.length < 20 && (
                <p className="text-xs text-destructive">Minimum 20 characters required ({mismatchComment.length}/20)</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleMismatchCancel}>Retake Photo</Button>
            <Button onClick={handleMismatchConfirm} disabled={!mismatchReason || mismatchComment.trim().length < 20}>
              Confirm & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
