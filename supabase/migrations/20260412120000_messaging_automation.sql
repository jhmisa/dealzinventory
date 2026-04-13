-- ============================================================
-- Messaging automation: review request queuing + queue processing
-- ============================================================

-- Seed default review request template
INSERT INTO messaging_templates (name, description, content_ja, content_en, message_type, variables, is_active)
VALUES (
  'Review Request (Post-Delivery)',
  'Sent 48 hours after delivery to request a product review',
  E'こんにちは {{customer_name}} 様！\n\nご注文 {{order_code}} の商品はいかがでしょうか？\nもしよろしければ、レビューをお願いいたします！ ⭐\n\nDealz K.K.',
  E'Hi {{customer_name}}! 😊\n\nKamusta na yung order mo ({{order_code}})? Hope you''re enjoying it! 🎉\n\nIf you have a moment, we''d love to hear your feedback po! A quick review really helps us out ⭐\n\nThank you! 🙏\nDealz K.K.',
  'REVIEW_REQUEST',
  ARRAY['customer_name', 'order_code'],
  true
);

-- Seed default delivery alert template
INSERT INTO messaging_templates (name, description, content_ja, content_en, message_type, variables, is_active)
VALUES (
  'Delivery Issue Alert',
  'Sent when Yamato tracking detects a delivery issue (failed attempt, investigating, returned)',
  E'{{customer_name}} 様\n\nご注文 {{order_code}} の配送に問題が発生しました。\nヤマト運輸ステータス: {{yamato_status}}\n追跡番号: {{tracking_number}}\n\nご不明な点がございましたらお知らせください。\nDealz K.K.',
  E'Hi {{customer_name}}! 📦\n\nMay update po kami sa order mo {{order_code}} — may issue sa delivery.\nYamato status: {{yamato_status}}\nTracking: {{tracking_number}}\n\nPaki-check po or let us know if you need help! 🙏\nDealz K.K.',
  'DELIVERY_ALERT',
  ARRAY['customer_name', 'order_code', 'yamato_status', 'tracking_number'],
  true
);

-- ============================================================
-- Function: Queue review requests for delivered orders (48h+)
-- ============================================================

CREATE OR REPLACE FUNCTION queue_review_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  review_template_id uuid;
  conv_id uuid;
BEGIN
  -- Get the active review request template
  SELECT id INTO review_template_id
  FROM messaging_templates
  WHERE message_type = 'REVIEW_REQUEST' AND is_active = true
  LIMIT 1;

  IF review_template_id IS NULL THEN
    RAISE WARNING 'queue_review_requests: no active REVIEW_REQUEST template';
    RETURN;
  END IF;

  -- Find DELIVERED orders, 48+ hours old, no review requested yet
  FOR rec IN
    SELECT o.id AS order_id, o.customer_id, o.order_code
    FROM orders o
    WHERE o.order_status = 'DELIVERED'
      AND o.review_requested_at IS NULL
      AND o.updated_at < now() - interval '48 hours'
      AND o.customer_id IS NOT NULL
      -- Don't double-queue: check if already in queue
      AND NOT EXISTS (
        SELECT 1 FROM automated_message_queue q
        WHERE q.order_id = o.id AND q.message_type = 'REVIEW_REQUEST'
      )
    ORDER BY o.updated_at
    LIMIT 50
  LOOP
    -- Find the customer's most recent conversation
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.customer_id = rec.customer_id
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 1;

    -- Queue the review request
    INSERT INTO automated_message_queue (
      conversation_id, customer_id, order_id, template_id, message_type, status, scheduled_at
    ) VALUES (
      conv_id, rec.customer_id, rec.order_id, review_template_id, 'REVIEW_REQUEST', 'PENDING', now()
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Function: Call process-message-queue Edge Function
-- ============================================================

CREATE OR REPLACE FUNCTION process_message_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count int;
  supabase_url text;
  service_key text;
BEGIN
  -- Check if there are any pending items before making the HTTP call
  SELECT count(*) INTO pending_count
  FROM automated_message_queue
  WHERE status = 'PENDING' AND scheduled_at <= now();

  IF pending_count = 0 THEN
    RETURN;
  END IF;

  -- Get config
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := current_setting('supabase.url', true);
  END IF;

  service_key := current_setting('app.settings.service_role_key', true);
  IF service_key IS NULL OR service_key = '' THEN
    service_key := current_setting('supabase.service_role_key', true);
  END IF;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'process_message_queue: missing supabase_url or service_role_key';
    RETURN;
  END IF;

  -- Call the Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-message-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ============================================================
-- pg_cron schedules
-- ============================================================

-- Every 30 minutes: check for orders needing review requests
SELECT cron.schedule(
  'queue-review-requests',
  '*/30 * * * *',
  $$SELECT queue_review_requests()$$
);

-- Every 10 minutes: process the automated message queue
SELECT cron.schedule(
  'process-message-queue',
  '*/10 * * * *',
  $$SELECT process_message_queue()$$
);
