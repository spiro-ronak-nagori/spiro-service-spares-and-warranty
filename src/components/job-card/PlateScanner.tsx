import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, RotateCcw, Check, AlertCircle, ScanLine } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlateScannerProps {
  workshopId: string;
  onResult: (regNumber: string) => void;
  ocrEnabled?: boolean;
}

type ScanState = 'idle' | 'preview' | 'processing' | 'error';

export function PlateScanner({ workshopId, onResult, ocrEnabled = true }: PlateScannerProps) {
  const [state, setState] = useState<ScanState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScanTime = useRef<number>(0);

  // If OCR is disabled, don't render the scanner at all
  if (!ocrEnabled) return null;

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
      setState('preview');
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setImageBase64(null);
    setState('idle');
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  const handleUsePhoto = async () => {
    if (!imageBase64) return;

    const now = Date.now();
    if (now - lastScanTime.current < 3000) {
      toast.error('Please wait a moment before scanning again');
      return;
    }
    lastScanTime.current = now;

    setState('processing');
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke('extract-plate', {
        body: { imageBase64, workshop_id: workshopId },
      });

      if (error) {
        console.error('Function error:', error);
        setErrorMessage('Unable to process image right now. Please enter manually.');
        setState('error');
        return;
      }

      if (data?.error) {
        setErrorMessage(data.error);
        setState('error');
        return;
      }

      if (data?.success && data.reg_number) {
        onResult(data.reg_number);
        toast.success(`Plate detected: ${data.reg_number}`);
        setPreviewUrl(null);
        setImageBase64(null);
        setState('idle');
      } else {
        setErrorMessage('Unable to process image right now. Please enter manually.');
        setState('error');
      }
    } catch (err) {
      console.error('Plate scan error:', err);
      setErrorMessage('Unable to process image right now. Please enter manually.');
      setState('error');
    }
  };

  const handleCancel = () => {
    setPreviewUrl(null);
    setImageBase64(null);
    setState('idle');
    setErrorMessage(null);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {state === 'idle' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCapture}
          className="gap-2"
        >
          <ScanLine className="h-4 w-4" />
          Scan Plate
        </Button>
      )}

      {(state === 'preview' || state === 'processing' || state === 'error') && previewUrl && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <img
            src={previewUrl}
            alt="Captured plate"
            className="w-full max-h-48 object-contain rounded-md"
          />

          {state === 'processing' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading plate...
            </div>
          )}

          {state === 'error' && errorMessage && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex gap-2">
            {state === 'preview' && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={handleRetake} className="gap-1 flex-1">
                  <RotateCcw className="h-3 w-3" />
                  Retake
                </Button>
                <Button type="button" size="sm" onClick={handleUsePhoto} className="gap-1 flex-1">
                  <Check className="h-3 w-3" />
                  Use Photo
                </Button>
              </>
            )}
            {state === 'error' && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={handleRetake} className="gap-1 flex-1">
                  <RotateCcw className="h-3 w-3" />
                  Retake
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleCancel} className="flex-1">
                  Cancel
                </Button>
              </>
            )}
            {state === 'processing' && (
              <Button type="button" variant="outline" size="sm" disabled className="flex-1">
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Processing...
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
