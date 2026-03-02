import { useRef } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

interface PhotoSlotProps {
  /** Label shown above the slot */
  prompt: string;
  /** Optional suffix like "(Camera only)" */
  suffix?: string;
  /** Already-captured file (new, not yet saved) */
  capturedFile?: File | null;
  /** Already-saved photo URL */
  existingUrl?: string | null;
  /** Called with the selected file */
  onCapture: (file: File) => void;
  /** Camera-only capture */
  cameraOnly?: boolean;
}

export function PhotoSlot({
  prompt,
  suffix = '(Camera only)',
  capturedFile,
  existingUrl,
  onCapture,
  cameraOnly = true,
}: PhotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasCaptured = !!capturedFile;
  const hasExisting = !!existingUrl;
  const hasImage = hasCaptured || hasExisting;
  const previewSrc = hasCaptured
    ? URL.createObjectURL(capturedFile!)
    : existingUrl || '';

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {prompt}{' '}
        {suffix && <span className="text-[10px]">{suffix}</span>}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={cameraOnly ? 'environment' : undefined}
        onChange={handleChange}
        className="sr-only"
      />
      {hasImage ? (
        <button
          type="button"
          onClick={handleClick}
          className="relative w-20 h-20 rounded-md overflow-hidden border bg-muted group focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <img
            src={previewSrc}
            alt={prompt}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
            <RefreshCw className="h-4 w-4 text-white" />
          </div>
          <span className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/50 text-center py-0.5">
            Tap to replace
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 w-full h-11 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Camera className="h-4 w-4 shrink-0" />
          <span>Tap to capture photo</span>
        </button>
      )}
    </div>
  );
}
