-- Content Studio Phase 1: content_categories — the content "pools".
-- Each category carries a colour that drives calendar cards, chips, and rule dots.
CREATE TABLE IF NOT EXISTS public.content_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  color text NOT NULL,               -- hex, e.g. #2E5E7D
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_categories_auth_all ON public.content_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.content_categories TO anon, authenticated, service_role;

INSERT INTO public.content_categories (name, slug, color, sort_order) VALUES
  ('New Arrivals','new-arrivals','#2E5E7D',1),
  ('Deals','deals','#C52F12',2),
  ('Reviews','reviews','#256B43',3),
  ('Kaitori Explainers','kaitori-explainers','#8A6200',4),
  ('Quotes','quotes','#6D5BA6',5)
ON CONFLICT (slug) DO NOTHING;
