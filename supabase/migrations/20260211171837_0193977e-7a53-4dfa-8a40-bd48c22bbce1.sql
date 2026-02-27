CREATE OR REPLACE FUNCTION public.generate_jc_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT;
  v_seq INTEGER;
  v_jc_number TEXT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  
  -- Get the next sequence number for today
  -- JC prefix (2 chars) + date (8 chars) = 10 chars, sequence starts at position 11
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(jc_number FROM 11) AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM public.job_cards
  WHERE jc_number LIKE 'JC' || v_date || '%';
  
  v_jc_number := 'JC' || v_date || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_jc_number;
END;
$function$;