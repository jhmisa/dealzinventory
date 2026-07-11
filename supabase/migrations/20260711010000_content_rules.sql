-- Content Studio Phase 2: content_rules — the automations.
-- A rule picks from a category pool on a cadence and materialises editable ghost posts
-- onto the calendar (via the materialize-rules edge fn). Rules never publish directly.
CREATE TABLE IF NOT EXISTS public.content_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.content_categories(id) ON DELETE CASCADE,
  cadence jsonb NOT NULL DEFAULT '{"days":[1,3,5],"time":"18:00"}'::jsonb, -- { days:int[0-6 Sun..Sat], time:'HH:MM' } JST
  pick_strategy text NOT NULL DEFAULT 'lru' CHECK (pick_strategy IN ('lru','random','newest')),
  platform text NOT NULL DEFAULT 'facebook',
  account_id text,
  page_id text,
  materialize_horizon_days int NOT NULL DEFAULT 14,
  active boolean NOT NULL DEFAULT true,
  active_from date,
  active_to date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_rules_active ON public.content_rules(active);

ALTER TABLE public.content_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_rules_auth_all ON public.content_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.content_rules TO anon, authenticated, service_role;

CREATE TRIGGER update_content_rules_updated_at
  BEFORE UPDATE ON public.content_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Now that content_rules exists, add the FK deferred from Phase 1's calendar columns.
ALTER TABLE public.social_media_posts
  ADD CONSTRAINT social_media_posts_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES public.content_rules(id) ON DELETE SET NULL;
