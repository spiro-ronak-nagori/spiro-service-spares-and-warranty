import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compress-image';

export interface SocOcrResult {
  socReading: number | null;
  confidence: number;
  dashboardDetected: boolean;
  error?: string;
}

export interface SocValidationResult {
  quality: { passed: boolean; message?: string } | null;
  ocr: SocOcrResult | null;
  mismatch: {
    hasMismatch: boolean;
    percentage: number;
    enteredValue: number;
    ocrValue: number;
  } | null;
  isValidating: boolean;
  error: string | null;
}

const BLUR_THRESHOLD = 100;
const BRIGHTNESS_MIN = 40;
const BRIGHTNESS_MAX = 220;
const GLARE_THRESHOLD = 0.15; // 15% of pixels near white = glare
const MISMATCH_THRESHOLD = 0.15; // 15% tolerance

export function useSocValidation() {
  const [result, setResult] = useState<SocValidationResult>({
    quality: null,
    ocr: null,
    mismatch: null,
    isValidating: false,
    error: null,
  });

  const checkImageQuality = useCallback(async (file: File): Promise<{ passed: boolean; message?: string }> => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve({ passed: true }); return; }

          const maxSize = 500;
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          let totalBrightness = 0;
          let glarePixels = 0;
          const totalPixels = data.length / 4;
          const grayscale: number[] = [];
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            grayscale.push(gray);
            totalBrightness += gray;
            // Detect glare: pixels with all channels > 240
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
              glarePixels++;
            }
          }
          const avgBrightness = totalBrightness / grayscale.length;
          const glareRatio = glarePixels / totalPixels;

          const width = canvas.width;
          const height = canvas.height;
          let laplacianSum = 0;
          let laplacianCount = 0;
          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const idx = y * width + x;
              const laplacian =
                -grayscale[idx - width] - grayscale[idx - 1] +
                4 * grayscale[idx] -
                grayscale[idx + 1] - grayscale[idx + width];
              laplacianSum += laplacian * laplacian;
              laplacianCount++;
            }
          }
          const laplacianVariance = laplacianSum / laplacianCount;

          const isBlurry = laplacianVariance < BLUR_THRESHOLD;
          const isDark = avgBrightness < BRIGHTNESS_MIN;
          const isBright = avgBrightness > BRIGHTNESS_MAX;
          const hasGlare = glareRatio > GLARE_THRESHOLD;

          if (isBlurry) resolve({ passed: false, message: 'Image is blurry. Please hold the camera steady.' });
          else if (isDark) resolve({ passed: false, message: 'Image is too dark. Turn on dashboard light.' });
          else if (isBright) resolve({ passed: false, message: 'Image is overexposed. Please reduce lighting.' });
          else if (hasGlare) resolve({ passed: false, message: 'Image has glare. Avoid reflections.' });
          else resolve({ passed: true });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const runOcr = useCallback(async (file: File): Promise<SocOcrResult> => {
    const compressed = await compressImage(file, 800, 0.75);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        try {
          const { data, error } = await supabase.functions.invoke('validate-soc', {
            body: { imageBase64: base64 },
          });
          if (error) throw error;
          resolve({
            socReading: data.socReading,
            confidence: data.confidence,
            dashboardDetected: data.dashboardDetected,
            error: data.error,
          });
        } catch (err) {
          console.error('SOC OCR error:', err);
          resolve({
            socReading: null,
            confidence: 0,
            dashboardDetected: false,
            error: err instanceof Error ? err.message : 'OCR failed',
          });
        }
      };
      reader.onerror = () => resolve({
        socReading: null,
        confidence: 0,
        dashboardDetected: false,
        error: 'Failed to read file',
      });
      reader.readAsDataURL(compressed);
    });
  }, []);

  const validateSoc = useCallback(async (file: File, enteredValue: number, ocrEnabled = true): Promise<SocValidationResult> => {
    setResult(prev => ({ ...prev, isValidating: true, error: null }));

    try {
      // Run quality check and OCR in parallel for speed
      const qualityPromise = checkImageQuality(file);
      const ocrPromise = ocrEnabled ? runOcr(file) : Promise.resolve(null);

      const [quality, ocr] = await Promise.all([qualityPromise, ocrPromise]);
      setResult(prev => ({ ...prev, quality, ocr }));

      if (!quality.passed) {
        const finalResult: SocValidationResult = { quality, ocr: null, mismatch: null, isValidating: false, error: quality.message || 'Image quality check failed' };
        setResult(finalResult);
        return finalResult;
      }

      if (!ocrEnabled) {
        const finalResult: SocValidationResult = { quality, ocr: null, mismatch: null, isValidating: false, error: null };
        setResult(finalResult);
        return finalResult;
      }

      if (!ocr!.dashboardDetected) {
        const finalResult: SocValidationResult = { quality, ocr, mismatch: null, isValidating: false, error: 'Battery SOC indicator not detected. Please retake photo.' };
        setResult(finalResult);
        return finalResult;
      }

      let mismatch: SocValidationResult['mismatch'] = null;
      if (ocr!.socReading !== null && enteredValue >= 0) {
        const diff = Math.abs(ocr!.socReading - enteredValue);
        const percentage = enteredValue > 0 ? diff / enteredValue : (diff > 0 ? 1 : 0);
        mismatch = {
          hasMismatch: percentage > MISMATCH_THRESHOLD,
          percentage: percentage * 100,
          enteredValue,
          ocrValue: ocr.socReading,
        };
      }

      const finalResult: SocValidationResult = { quality, ocr, mismatch, isValidating: false, error: null };
      setResult(finalResult);
      return finalResult;
    } catch (err) {
      const errorResult: SocValidationResult = { quality: null, ocr: null, mismatch: null, isValidating: false, error: err instanceof Error ? err.message : 'Validation failed' };
      setResult(errorResult);
      return errorResult;
    }
  }, [checkImageQuality, runOcr]);

  const reset = useCallback(() => {
    setResult({ quality: null, ocr: null, mismatch: null, isValidating: false, error: null });
  }, []);

  return { ...result, validateSoc, reset };
}
