-- Replace webhook_delivery_log with webhook_events: a queue table that
-- captures the raw payload immediately (ACK fast) and tracks processing status.

CREATE TABLE webhook_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missive_message_id      text NOT NULL,
  missive_conversation_id text,
  raw_payload             jsonb NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message           text,
  processing_ms           integer,
  attempts                integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  processed_at            timestamptz
);

CREATE INDEX idx_webhook_events_status ON webhook_events (status) WHERE status = 'pending';
CREATE UNIQUE INDEX idx_webhook_events_dedupe ON webhook_events (missive_message_id);
CREATE INDEX idx_webhook_events_created ON webhook_events (created_at DESC);

-- RLS: staff can read, service role can write
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read access" ON webhook_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access" ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');

-- Update check_message_health() to read from webhook_events instead of webhook_delivery_log
CREATE OR REPLACE FUNCTION check_message_health()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  now_ts        timestamptz := now();
  hour_jst      integer := extract(hour FROM now_ts AT TIME ZONE 'Asia/Tokyo');
  is_biz_hours  boolean := hour_jst BETWEEN 9 AND 21;
  webhook_count bigint;
  webhook_errors bigint;
  webhook_total  bigint;
  error_rate    numeric;
  msg_count     bigint;
  msg_recent_count bigint;
  last_sync_val text;
  last_sync_ts  timestamptz;
BEGIN
  -- 1. Webhook silent check (business hours only)
  IF is_biz_hours THEN
    SELECT count(*) INTO webhook_count
    FROM webhook_events
    WHERE created_at > now_ts - interval '2 hours';

    SELECT count(*) INTO msg_recent_count
    FROM messages
    WHERE created_at > now_ts - interval '2 hours';

    IF webhook_count = 0 AND msg_recent_count = 0 THEN
      INSERT INTO system_alerts (alert_type, message, details)
      SELECT 'webhook_silent',
             'No webhook deliveries or messages in the last 2 hours',
             jsonb_build_object('checked_at', now_ts, 'window_hours', 2, 'webhook_count', webhook_count, 'message_count', msg_recent_count)
      WHERE NOT EXISTS (
        SELECT 1 FROM system_alerts
        WHERE alert_type = 'webhook_silent' AND resolved = false
      );
    ELSE
      UPDATE system_alerts
      SET resolved = true, resolved_at = now_ts
      WHERE alert_type = 'webhook_silent' AND resolved = false;
    END IF;
  END IF;

  -- 2. Webhook error spike (>20% error rate in last hour)
  SELECT count(*) FILTER (WHERE status = 'failed'),
         count(*)
  INTO webhook_errors, webhook_total
  FROM webhook_events
  WHERE created_at > now_ts - interval '1 hour';

  IF webhook_total >= 5 THEN
    error_rate := webhook_errors::numeric / webhook_total;
    IF error_rate > 0.20 THEN
      INSERT INTO system_alerts (alert_type, message, details)
      SELECT 'webhook_errors',
             format('Webhook error rate %.0f%% (%s/%s) in last hour', error_rate * 100, webhook_errors, webhook_total),
             jsonb_build_object('checked_at', now_ts, 'error_count', webhook_errors, 'total_count', webhook_total, 'error_rate', error_rate)
      WHERE NOT EXISTS (
        SELECT 1 FROM system_alerts
        WHERE alert_type = 'webhook_errors' AND resolved = false
      );
    ELSE
      UPDATE system_alerts
      SET resolved = true, resolved_at = now_ts
      WHERE alert_type = 'webhook_errors' AND resolved = false;
    END IF;
  ELSE
    UPDATE system_alerts
    SET resolved = true, resolved_at = now_ts
    WHERE alert_type = 'webhook_errors' AND resolved = false;
  END IF;

  -- 3. No new messages (business hours, 4-hour gap)
  IF is_biz_hours THEN
    SELECT count(*) INTO msg_count
    FROM messages
    WHERE role = 'customer'
      AND created_at > now_ts - interval '4 hours';

    IF msg_count = 0 THEN
      INSERT INTO system_alerts (alert_type, message, details)
      SELECT 'message_gap',
             'No customer messages received in the last 4 hours',
             jsonb_build_object('checked_at', now_ts, 'window_hours', 4)
      WHERE NOT EXISTS (
        SELECT 1 FROM system_alerts
        WHERE alert_type = 'message_gap' AND resolved = false
      );
    ELSE
      UPDATE system_alerts
      SET resolved = true, resolved_at = now_ts
      WHERE alert_type = 'message_gap' AND resolved = false;
    END IF;
  END IF;

  -- 4. Backfill stale (checked_at > 30 min ago)
  SELECT value INTO last_sync_val
  FROM system_settings
  WHERE key = 'messaging_last_sync';

  IF last_sync_val IS NOT NULL THEN
    BEGIN
      last_sync_ts := (last_sync_val::jsonb ->> 'checked_at')::timestamptz;
      IF last_sync_ts < now_ts - interval '30 minutes' THEN
        INSERT INTO system_alerts (alert_type, message, details)
        SELECT 'sync_stale',
               'Message sync has not run in over 30 minutes',
               jsonb_build_object('checked_at', now_ts, 'last_sync_at', last_sync_ts)
        WHERE NOT EXISTS (
          SELECT 1 FROM system_alerts
          WHERE alert_type = 'sync_stale' AND resolved = false
        );
      ELSE
        UPDATE system_alerts
        SET resolved = true, resolved_at = now_ts
        WHERE alert_type = 'sync_stale' AND resolved = false;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$$;

-- Update cleanup cron to clean webhook_events instead
CREATE OR REPLACE FUNCTION cleanup_webhook_delivery_log()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM webhook_delivery_log WHERE created_at < now() - interval '30 days';
  DELETE FROM webhook_events WHERE created_at < now() - interval '30 days';
$$;
