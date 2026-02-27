
-- PART 1: Add COMPLETED to job_card_status enum
ALTER TYPE public.job_card_status ADD VALUE IF NOT EXISTS 'COMPLETED';

-- PART 1: Feedback form templates
CREATE TABLE public.feedback_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_form_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read active templates (needed for public feedback form)
CREATE POLICY "Anyone can read active templates"
  ON public.feedback_form_templates FOR SELECT
  USING (is_active = true);

-- Super admins can manage templates
CREATE POLICY "Super admins can manage templates"
  ON public.feedback_form_templates FOR ALL
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

-- Question type enum
CREATE TYPE public.feedback_question_type AS ENUM ('SCALE_1_5', 'NPS_0_10');

-- Feedback form questions
CREATE TABLE public.feedback_form_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.feedback_form_templates(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type public.feedback_question_type NOT NULL,
  min_label text,
  max_label text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_form_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active questions"
  ON public.feedback_form_questions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Super admins can manage questions"
  ON public.feedback_form_questions FOR ALL
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

-- PART 2: Feedback requests
CREATE TYPE public.feedback_request_status AS ENUM ('PENDING', 'SUBMITTED', 'EXPIRED');

CREATE TABLE public.feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL UNIQUE REFERENCES public.job_cards(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  template_id uuid NOT NULL REFERENCES public.feedback_form_templates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  status public.feedback_request_status NOT NULL DEFAULT 'PENDING'
);

ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

-- Public read by token (no auth needed for feedback form)
CREATE POLICY "Anyone can read feedback requests by token"
  ON public.feedback_requests FOR SELECT
  USING (true);

-- Service role inserts (edge function)
CREATE POLICY "Service role can insert feedback requests"
  ON public.feedback_requests FOR INSERT
  WITH CHECK (true);

-- Service role can update (for marking submitted/expired)
CREATE POLICY "Service role can update feedback requests"
  ON public.feedback_requests FOR UPDATE
  USING (true);

-- PART 3: Short links
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL UNIQUE,
  feedback_request_id uuid NOT NULL REFERENCES public.feedback_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Public read (needed to resolve short codes without auth)
CREATE POLICY "Anyone can read short links"
  ON public.short_links FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert short links"
  ON public.short_links FOR INSERT
  WITH CHECK (true);

-- PART 6: Feedback responses
CREATE TABLE public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_request_id uuid NOT NULL REFERENCES public.feedback_requests(id) ON DELETE CASCADE,
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.feedback_form_questions(id),
  numeric_value integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

-- Public insert (customer submits without auth)
CREATE POLICY "Anyone can insert feedback responses"
  ON public.feedback_responses FOR INSERT
  WITH CHECK (true);

-- Authenticated users can read (for reports)
CREATE POLICY "Authenticated can read feedback responses"
  ON public.feedback_responses FOR SELECT
  USING (true);

-- Seed the default template
INSERT INTO public.feedback_form_templates (id, name, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Service Feedback', true);

INSERT INTO public.feedback_form_questions (template_id, question_text, question_type, min_label, max_label, sort_order) VALUES
('00000000-0000-0000-0000-000000000001', 'How was your overall experience with the service', 'SCALE_1_5', 'Very bad', 'Very good', 1),
('00000000-0000-0000-0000-000000000001', 'I am satisfied with the quality of repair', 'SCALE_1_5', 'Strongly disagree', 'Strongly agree', 2),
('00000000-0000-0000-0000-000000000001', 'Repair costs were transparent and well explained', 'SCALE_1_5', 'Strongly disagree', 'Strongly agree', 3),
('00000000-0000-0000-0000-000000000001', 'Will you recommend this workshop to another Spiro rider?', 'NPS_0_10', null, null, 4);

-- Add triggers for updated_at
CREATE TRIGGER update_feedback_form_templates_updated_at
  BEFORE UPDATE ON public.feedback_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feedback_form_questions_updated_at
  BEFORE UPDATE ON public.feedback_form_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
