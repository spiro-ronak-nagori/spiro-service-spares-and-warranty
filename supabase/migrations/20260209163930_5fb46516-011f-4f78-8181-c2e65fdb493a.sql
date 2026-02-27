-- Update protect_profile_fields to skip checks when no auth context (service role)
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
  v_workshop_id UUID;
BEGIN
  -- Skip protection if no auth context (e.g. service role / migrations)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get role of the authenticated user
  SELECT p.role, p.workshop_id INTO v_role, v_workshop_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Super admins can change anything
  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;
  
  -- Workshop admins can change users in their workshop (except their own role)
  IF v_role = 'workshop_admin' AND OLD.workshop_id = v_workshop_id THEN
    IF OLD.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
    RETURN NEW;
  END IF;
  
  -- Regular users: prevent changing protected fields
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify role';
  END IF;
  IF NEW.workshop_id IS DISTINCT FROM OLD.workshop_id THEN
    RAISE EXCEPTION 'Cannot modify workshop assignment';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot modify status';
  END IF;
  
  RETURN NEW;
END;
$function$;