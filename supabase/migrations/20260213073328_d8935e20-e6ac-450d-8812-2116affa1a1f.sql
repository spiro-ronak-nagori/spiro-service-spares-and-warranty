
ALTER TABLE public.countries_master
  ADD COLUMN IF NOT EXISTS sms_username TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_id TEXT,
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE public.countries_master SET sms_username = 'spironet', sms_sender_id = 'SPIRO' WHERE iso2 = 'KE';
UPDATE public.countries_master SET sms_username = 'Spironetug', sms_sender_id = 'SPIRO' WHERE iso2 = 'UG';
UPDATE public.countries_master SET sms_username = 'spironetrw', sms_sender_id = 'SPIRO' WHERE iso2 = 'RW';
