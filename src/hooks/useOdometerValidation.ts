import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compress-image';

export interface ImageQualityResult {
  isBlurry: boolean;
  isDark: boolean;
  isBright: boolean;
  blurScore: number;
  brightnessScore: number;
  passed: boolean;
  message?: string;
}

export interface OcrResult {
  ocrReading: number | null;
  ocrConfidence: number;
  clusterDetected: boolean;
  socReading: number | null;
  socConfidence: number;
  socDetected: boolean;
  error?: string;
}

export interface ValidationResult {
  quality: ImageQualityResult | null;
  ocr: OcrResult | null;
  mismatch: {
    hasMismatch: boolean;
    percentage: number;
    enteredValue: number;
    ocrValue: number;
  } | null;
  isValidating: boolean;
  error: string | null;
}

const BLUR_THRESHOLD = 100; // Laplacian variance threshold
const BRIGHTNESS_MIN = 40;
const BRIGHTNESS_MAX = 220;
const MISMATCH_THRESHOLD = 0.10; // 10%

export function useOdometerValidation() {
  const [result, setResult] = useState<ValidationResult>({
    quality: null,
    ocr: null,
    mismatch: null,
    isValidating: false,
    error: null,
  });

  const checkImageQuality = useCallback(async (file: File): Promise<ImageQualityResult> => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({
              isBlurry: false,
              isDark: false,
              isBright: false,
              blurScore: 0,
              brightnessScore: 128,
              passed: true,
            });
            return;
          }

          // Resize for faster processing
          const maxSize = 500;
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Calculate brightness (average of all pixels)
          let totalBrightness = 0;
          const grayscale: number[] = [];
          
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            grayscale.push(gray);
            totalBrightness += gray;
          }
          
          const avgBrightness = totalBrightness / grayscale.length;

          // Calculate blur using Laplacian variance
          // Higher variance = sharper image
          const width = canvas.width;
          const height = canvas.height;
          let laplacianSum = 0;
          let laplacianCount = 0;

          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const idx = y * width + x;
              // Laplacian kernel: [0,-1,0], [-1,4,-1], [0,-1,0]
              const laplacian = 
                -grayscale[idx - width] +
                -grayscale[idx - 1] +
                4 * grayscale[idx] +
                -grayscale[idx + 1] +
                -grayscale[idx + width];
              laplacianSum += laplacian * laplacian;
              laplacianCount++;
            }
          }

          const laplacianVariance = laplacianSum / laplacianCount;

          const isBlurry = laplacianVariance < BLUR_THRESHOLD;
          const isDark = avgBrightness < BRIGHTNESS_MIN;
          const isBright = avgBrightness > BRIGHTNESS_MAX;
          const passed = !isBlurry && !isDark && !isBright;

          let message: string | undefined;
          if (isBlurry) message = 'Image appears blurry. Please retake with steadier hands.';
          else if (isDark) message = 'Image is too dark. Please ensure adequate lighting.';
          else if (isBright) message = 'Image is overexposed. Please reduce lighting or glare.';

          resolve({
            isBlurry,
            isDark,
            isBright,
            blurScore: laplacianVariance,
            brightnessScore: avgBrightness,
            passed,
            message,
          });
        };

        img.src = e.target?.result as string;
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const runOcr = useCallback(async (file: File): Promise<OcrResult> => {
    // Compress image to 800px for faster upload & processing
    const compressed = await compressImage(file, 800, 0.75);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        try {
          const { data, error } = await supabase.functions.invoke('validate-odometer', {
            body: { imageBase64: base64 },
          });
          if (error) throw error;
          resolve({
            ocrReading: data.ocrReading,
            ocrConfidence: data.ocrConfidence,
            clusterDetected: data.clusterDetected,
            socReading: data.socReading ?? null,
            socConfidence: data.socConfidence ?? 0,
            socDetected: data.socDetected ?? false,
            error: data.error,
          });
        } catch (err) {
          console.error('OCR error:', err);
          resolve({
            ocrReading: null,
            ocrConfidence: 0,
            clusterDetected: false,
            socReading: null,
            socConfidence: 0,
            socDetected: false,
            error: err instanceof Error ? err.message : 'OCR failed',
          });
        }
      };
      reader.onerror = () => resolve({
        ocrReading: null,
        ocrConfidence: 0,
        clusterDetected: false,
        socReading: null,
        socConfidence: 0,
        socDetected: false,
        error: 'Failed to read file',
      });
      reader.readAsDataURL(compressed);
    });
  }, []);

  const validateOdometer = useCallback(async (
    file: File,
    enteredValue: number,
    ocrEnabled = true
  ): Promise<ValidationResult> => {
    setResult(prev => ({ ...prev, isValidating: true, error: null }));

    try {
      // Step 1: Check image quality
      const quality = await checkImageQuality(file);
      
      setResult(prev => ({ ...prev, quality }));

      if (!quality.passed) {
        const finalResult: ValidationResult = {
          quality,
          ocr: null,
          mismatch: null,
          isValidating: false,
          error: quality.message || 'Image quality check failed',
        };
        setResult(finalResult);
        return finalResult;
      }

      // If OCR is disabled, skip OCR and mismatch check — image captured for record-keeping only
      if (!ocrEnabled) {
        const finalResult: ValidationResult = {
          quality,
          ocr: null,
          mismatch: null,
          isValidating: false,
          error: null,
        };
        setResult(finalResult);
        return finalResult;
      }

      // Step 2: Run OCR
      const ocr = await runOcr(file);
      
      setResult(prev => ({ ...prev, ocr }));

      if (!ocr.clusterDetected) {
        const finalResult: ValidationResult = {
          quality,
          ocr,
          mismatch: null,
          isValidating: false,
          error: 'No odometer cluster detected in image. Please capture the odometer display clearly.',
        };
        setResult(finalResult);
        return finalResult;
      }

      // Step 3: Check mismatch
      let mismatch: ValidationResult['mismatch'] = null;
      
      if (ocr.ocrReading !== null && enteredValue > 0) {
        const diff = Math.abs(ocr.ocrReading - enteredValue);
        const percentage = diff / enteredValue;
        
        mismatch = {
          hasMismatch: percentage > MISMATCH_THRESHOLD,
          percentage: percentage * 100,
          enteredValue,
          ocrValue: ocr.ocrReading,
        };
      }

      const finalResult: ValidationResult = {
        quality,
        ocr,
        mismatch,
        isValidating: false,
        error: null,
      };

      setResult(finalResult);
      return finalResult;
    } catch (err) {
      const errorResult: ValidationResult = {
        quality: null,
        ocr: null,
        mismatch: null,
        isValidating: false,
        error: err instanceof Error ? err.message : 'Validation failed',
      };
      setResult(errorResult);
      return errorResult;
    }
  }, [checkImageQuality, runOcr]);

  const reset = useCallback(() => {
    setResult({
      quality: null,
      ocr: null,
      mismatch: null,
      isValidating: false,
      error: null,
    });
  }, []);

  return {
    ...result,
    validateOdometer,
    reset,
  };
}
