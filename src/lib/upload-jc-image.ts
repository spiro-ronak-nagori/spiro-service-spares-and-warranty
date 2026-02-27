import { supabase } from '@/integrations/supabase/client';

type ImageType = 'odo' | 'incoming_soc' | 'outgoing_soc';

/**
 * Compress an image file client-side to reasonable quality/size.
 * Returns a Blob ready for upload.
 */
async function compressImage(file: File, maxDim = 1200, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a JC audit image to storage and return a signed URL.
 * Path: job_cards/{jcId}/{type}/{timestamp}.jpg
 */
export async function uploadJcImage(
  file: File,
  jcId: string,
  type: ImageType
): Promise<string> {
  const blob = await compressImage(file);
  const timestamp = Date.now();
  const path = `job_cards/${jcId}/${type}/${timestamp}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('jc-audit-images')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // Generate a signed URL valid for 1 year
  const { data: signedData, error: signError } = await supabase.storage
    .from('jc-audit-images')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (signError || !signedData?.signedUrl) {
    throw signError || new Error('Failed to create signed URL');
  }

  return signedData.signedUrl;
}
