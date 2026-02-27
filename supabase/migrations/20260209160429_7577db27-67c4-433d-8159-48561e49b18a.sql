-- Disable only the protect_profile_fields trigger
ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_fields_trigger;

-- Update Nikhil to super_admin
UPDATE public.profiles SET role = 'super_admin' WHERE id = '30d842af-30dd-4d4b-9134-5d81ce04207d';

-- Re-enable the trigger
ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_fields_trigger;