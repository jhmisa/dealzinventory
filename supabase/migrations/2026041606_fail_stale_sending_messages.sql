-- Backstop sweep for outbound messages stuck in SENDING state.
--
-- The send-message Edge Function now has a 20s hard timeout on the Missive
-- call, so in normal operation a hung Missive API will resolve to FAILED
-- within seconds. This sweep catches the remaining edge cases:
--   - Edge Function killed mid-execution (deploy, OOM, worker timeout)
--   - DB update after a successful Missive send fails (conn drop)
--   - Any future code path that forgets to transition out of SENDING
--
-- Any message stuck in SENDING for >3 minutes is marked FAILED so the UI
-- shows the retry button instead of an infinite spinner. The 3-minute
-- threshold is well beyond the 20s Edge Function timeout and Supabase's
-- ~150s function execution limit, so it will never race a legitimate send.

CREATE OR REPLACE FUNCTION fail_stale_sending_messages()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  swept_count integer;
BEGIN
  WITH updated AS (
    UPDATE messages
    SET
      status = 'FAILED',
      error_details = jsonb_build_object(
        'reason', 'stuck_sending_sweep',
        'swept_at', now(),
        'original_created_at', created_at,
        'note', 'Message was stuck in SENDING for over 3 minutes. It may or may not have been delivered.'
      )
    WHERE status = 'SENDING'
      AND created_at < now() - interval '3 minutes'
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO swept_count FROM updated;

  RETURN swept_count;
END;
$$;

-- Schedule via pg_cron every minute. Unschedule any prior registration first
-- so re-running this migration is safe.
DO $$
BEGIN
  PERFORM cron.unschedule('fail-stale-sending-messages');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist yet; ignore.
  NULL;
END $$;

SELECT cron.schedule(
  'fail-stale-sending-messages',
  '* * * * *',
  $$SELECT fail_stale_sending_messages();$$
);
