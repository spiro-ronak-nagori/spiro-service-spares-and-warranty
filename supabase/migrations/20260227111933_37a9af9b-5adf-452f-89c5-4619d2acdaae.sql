
-- Add storage policies for spare-photos bucket so workshop users can upload and view photos
-- Upload policy: authenticated users can upload to spare-photos
CREATE POLICY "Authenticated users can upload spare photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'spare-photos');

-- Select policy: authenticated users can view spare photos
CREATE POLICY "Authenticated users can view spare photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'spare-photos');
