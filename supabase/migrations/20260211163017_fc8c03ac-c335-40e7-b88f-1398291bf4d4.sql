
-- Add new system settings
INSERT INTO public.system_settings (key, value)
VALUES 
  ('ENABLE_IMAGE_OCR', 'true'),
  ('ENABLE_FEEDBACK_FORM', 'true')
ON CONFLICT (key) DO NOTHING;

-- Add TEXT to feedback_question_type enum
ALTER TYPE public.feedback_question_type ADD VALUE IF NOT EXISTS 'TEXT';
