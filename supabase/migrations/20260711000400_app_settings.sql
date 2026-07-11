-- Content Studio Phase 1: a tiny key/value settings store.
-- Seeds the content-publisher kill switch OFF — the publish-due cron checks this flag
-- and no-ops while it is false, so nothing auto-posts until Joey flips it on.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_auth_all ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.app_settings TO anon, authenticated, service_role;

INSERT INTO public.app_settings (key, value) VALUES
  ('content_publisher_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
