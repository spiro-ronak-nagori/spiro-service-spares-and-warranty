-- Fix 1: feedback_requests - replace public SELECT with workshop-scoped policy
DROP POLICY IF EXISTS "Anyone can read feedback requests by token" ON public.feedback_requests;
CREATE POLICY "Workshop users can view feedback requests"
  ON public.feedback_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_cards jc
      WHERE jc.id = feedback_requests.job_card_id
      AND public.is_user_in_workshop(jc.workshop_id)
    )
  );

-- Fix 2: feedback_responses - replace public SELECT with workshop-scoped policy
DROP POLICY IF EXISTS "Authenticated can read feedback responses" ON public.feedback_responses;
DROP POLICY IF EXISTS "Anyone can insert feedback responses" ON public.feedback_responses;
CREATE POLICY "Workshop users can view feedback responses"
  ON public.feedback_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_cards jc
      WHERE jc.id = feedback_responses.job_card_id
      AND public.is_user_in_workshop(jc.workshop_id)
    )
  );
-- Insert is done via service role from edge functions, no public insert needed

-- Fix 3: short_links - replace public SELECT with workshop-scoped policy
DROP POLICY IF EXISTS "Anyone can read short links" ON public.short_links;
CREATE POLICY "Workshop users can view short links"
  ON public.short_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback_requests fr
      JOIN public.job_cards jc ON jc.id = fr.job_card_id
      WHERE fr.id = short_links.feedback_request_id
      AND public.is_user_in_workshop(jc.workshop_id)
    )
  );