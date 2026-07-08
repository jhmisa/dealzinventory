-- Shoots: lightweight kanban for planning live-selling / product video shoots.
-- Phase 0 of the social & video marketing automation. Assignees come from the existing
-- staff_profiles table (no new staff roster needed). The conversational shoot planner AI
-- (create_shoot tool) drops cards onto the PLANNED lane; the team moves them across lanes.
DO $$ BEGIN
  CREATE TYPE shoot_status AS ENUM ('PLANNED','ASSIGNED','SHOOTING','PUBLISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.shoots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status shoot_status NOT NULL DEFAULT 'PLANNED',
  assignee_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  item_codes text[] NOT NULL DEFAULT '{}',
  notes text,
  orientation text, -- optional 'portrait' | 'landscape'
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shoots_status ON public.shoots(status);

ALTER TABLE public.shoots ENABLE ROW LEVEL SECURITY;

CREATE POLICY shoots_auth_all ON public.shoots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.shoots TO anon, authenticated, service_role;

-- Reuse the app's shared updated_at trigger function (used across the schema).
CREATE TRIGGER update_shoots_updated_at
  BEFORE UPDATE ON public.shoots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
