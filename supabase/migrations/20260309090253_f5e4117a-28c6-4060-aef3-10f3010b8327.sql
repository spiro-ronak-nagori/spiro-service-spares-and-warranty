
CREATE OR REPLACE FUNCTION public.generate_jc_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT;
  v_prefix TEXT;
  v_max_suffix TEXT;
  v_next_int INTEGER;
  v_result TEXT;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  v_prefix := 'JC' || v_date;

  -- Find the highest existing suffix for today
  SELECT max(substring(jc_number FROM 11))
    INTO v_max_suffix
    FROM public.job_cards
   WHERE jc_number LIKE v_prefix || '%';

  IF v_max_suffix IS NULL THEN
    v_next_int := 1;
  ELSE
    -- Decode base-36 suffix to integer, then increment
    v_next_int := 0;
    FOR i IN 1..length(v_max_suffix) LOOP
      DECLARE
        ch TEXT := upper(substring(v_max_suffix FROM i FOR 1));
        val INTEGER;
      BEGIN
        IF ch >= '0' AND ch <= '9' THEN
          val := ascii(ch) - ascii('0');
        ELSIF ch >= 'A' AND ch <= 'Z' THEN
          val := ascii(ch) - ascii('A') + 10;
        ELSE
          val := 0;
        END IF;
        v_next_int := v_next_int * 36 + val;
      END;
    END LOOP;
    v_next_int := v_next_int + 1;
  END IF;

  -- Encode v_next_int as 4-char base-36
  DECLARE
    chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    encoded TEXT := '';
    remainder INTEGER;
    n INTEGER := v_next_int;
  BEGIN
    IF n = 0 THEN
      encoded := '0';
    END IF;
    WHILE n > 0 LOOP
      remainder := n % 36;
      encoded := substring(chars FROM remainder + 1 FOR 1) || encoded;
      n := n / 36;
    END LOOP;
    v_result := v_prefix || lpad(encoded, 4, '0');
  END;

  RETURN v_result;
END;
$function$;
