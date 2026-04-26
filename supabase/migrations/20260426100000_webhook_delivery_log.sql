-- Webhook delivery logging: every Missive webhook call leaves evidence in the DB
-- so we can detect when the webhook goes silent or starts erroring.

CREATE TABLE webhook_delivery_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missive_message_id      text NOT NULL,
  missive_conversation_id text,
  status                  text NOT NULL CHECK (status IN ('success','duplicate','error')),
  error_message           text,
  processing_ms           integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wdl_created ON webhook_delivery_log(created_at DESC);
CREATE INDEX idx_wdl_errors ON webhook_delivery_log(status) WHERE status = 'error';

-- RLS: staff can read, service role can write
ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read access" ON webhook_delivery_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access" ON webhook_delivery_log
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-cleanup: delete rows older than 30 days (runs daily at 3am JST / 18:00 UTC)
CREATE OR REPLACE FUNCTION cleanup_webhook_delivery_log()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM webhook_delivery_log WHERE created_at < now() - interval '30 days';
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-webhook-delivery-log');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-webhook-delivery-log',
  '0 18 * * *',
  $$SELECT cleanup_webhook_delivery_log();$$
);
