-- Force requires_spares = false on category rows (parent_code IS NULL)
CREATE OR REPLACE FUNCTION public.enforce_requires_spares_on_categories()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.parent_code IS NULL THEN
    NEW.requires_spares := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_requires_spares
BEFORE INSERT OR UPDATE ON public.service_categories
FOR EACH ROW
EXECUTE FUNCTION public.enforce_requires_spares_on_categories();

-- Backfill: set all existing category rows to requires_spares = false
UPDATE public.service_categories
SET requires_spares = false
WHERE parent_code IS NULL AND requires_spares = true;