-- Make generate_jc_number SECURITY DEFINER so it can access the sequence
CREATE OR REPLACE FUNCTION public.generate_jc_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT;
  v_seq  BIGINT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  v_seq  := nextval('public.job_card_number_seq');
  RETURN 'JC' || v_date || LPAD(v_seq::TEXT, 4, '0');
END;
$function$;