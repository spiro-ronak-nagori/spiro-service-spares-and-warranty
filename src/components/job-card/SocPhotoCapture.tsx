import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
} from 'lucide-react';
import { useSocValidation, SocValidationResult } from '@/hooks/useSocValidation';
import { cn } from '@/lib/utils';

export { type SocValidationResult };

interface SocPhotoCaptureProps {
  /** Called after OCR completes with file, result, and extracted SOC reading */
  onValidationComplete: (
    file: File | null,
    result: SocValidationResult | null,
  ) => void;
  disabled?: boolean;
  ocrEnabled?: boolean;
  /** 'incoming' (default) or 'outgoing' — changes labels only */
  direction?: 'incoming' | 'outgoing';
}

export function SocPhotoCapture({
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

  const { quality, ocr, isValidating, error, validateSoc, reset } = useSocValidation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    reset();

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selectedFile);
    setFile(selectedFile);

    // Pass 0 for enteredValue — we don't compare yet, just extract
    const result = await validateSoc(selectedFile, 0, ocrEnabled);
    onValidationComplete(selectedFile, result);
  };

  const handleRetake = () => {
    setFile(null);
    setPreview(null);
    reset();
    onValidationComplete(null, null);

    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const isValid = ocrEnabled
    ? quality?.passed && ocr?.dashboardDetected && !error
    : quality?.passed && !error;

  const getStatusColor = () => {
    if (isValidating) return 'border-muted';
    if (error) return 'border-destructive';
    if (isValid) return 'border-success';
    return 'border-muted';
  };

  const getStatusIcon = () => {
    if (isValidating) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    if (error) return <AlertCircle className="h-5 w-5 text-destructive" />;
    if (isValid) return <CheckCircle2 className="h-5 w-5 text-success" />;
    return null;
  };

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
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-center gap-2 h-24 border-2 border-dashed rounded-lg transition-colors',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/50'
          )}
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-muted-foreground">Tap to capture dashboard photo</span>
        </button>
      ) : (
        <div className={cn('rounded-lg border-2 p-3', getStatusColor())}>
          <div className="flex items-center gap-3">
            {preview && (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="relative flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-muted"
              >
                <img src={preview} alt="Dashboard" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                  <Eye className="h-4 w-4 text-white" />
                </div>
              </button>
            )}

            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getStatusIcon()}
              <span className="text-sm font-medium">
                {isValidating && 'Analysing photo...'}
                {error && 'Validation Failed'}
                {!isValidating && !error && isValid && 'Photo Validated'}
              </span>
            </div>

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

          {isValidating && (
            <p className="text-xs text-muted-foreground mt-2">
              Checking quality, reading SOC...
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive mt-2">{error}</p>
          )}

          {!isValidating && !error && quality && (
            <div className="mt-2 space-y-1 text-xs">
              <p className={quality.passed ? 'text-success' : 'text-destructive'}>
                {quality.passed ? '✓' : '✗'} Image quality {!quality.passed && `— ${quality.message}`}
              </p>
              {ocr && (
                <p className={ocr.dashboardDetected ? 'text-success' : 'text-destructive'}>
                  {ocr.dashboardDetected ? '✓' : '✗'} SOC detected{ocr.socReading !== null && `: ${ocr.socReading}%`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {ocrEnabled
          ? 'Photo is validated for quality; SOC is extracted automatically'
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
    </div>
  );
}
