-- Sub-intent taxonomy + per-intent autonomy (OFF/DRAFT/SEND).
-- Categories = existing messaging_specialists; sub-intents hang off them.

CREATE TABLE IF NOT EXISTS public.messaging_sub_intents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialist_id         uuid NOT NULL REFERENCES public.messaging_specialists(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  recognition_cues      text NOT NULL DEFAULT '',
  handling_instructions text NOT NULL DEFAULT '',
  autonomy              text NOT NULL DEFAULT 'DRAFT'
                          CHECK (autonomy IN ('OFF','DRAFT','SEND')),
  target_folder         text,                         -- optional topic-folder override (folder name)
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (specialist_id, slug)
);

-- Topic-folder home for a Category. NULL keeps today's hardcoded intent->folder routing
-- (preserves the return->Aftersales / complaint->Concern split); set it for custom categories.
ALTER TABLE public.messaging_specialists ADD COLUMN IF NOT EXISTS target_folder text;

ALTER TABLE public.messaging_sub_intents ENABLE ROW LEVEL SECURITY;

-- Staff (authenticated) manage sub-intents; service_role (edge functions) read them.
CREATE POLICY "sub_intents_authenticated_all" ON public.messaging_sub_intents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sub_intents_service_all" ON public.messaging_sub_intents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Explicit grants (belt-and-suspenders alongside the project's ALTER DEFAULT PRIVILEGES).
GRANT ALL ON public.messaging_sub_intents TO anon, authenticated, service_role;

-- Flag + allow system (non-staff) sender for auto-sent messages.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS auto_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ALTER COLUMN sent_by DROP NOT NULL;

-- Global confidence floor for auto-send (SEND downgrades to DRAFT below this).
INSERT INTO public.system_settings (key, value)
VALUES ('auto_send_confidence_threshold', '0.85')
ON CONFLICT (key) DO NOTHING;

-- Seed example sub-intents that ALSO fix the raffle-confusion bug out of the box.
-- promo_raffle under Sales: recognize promo/raffle messages, do NOT search inventory.
INSERT INTO public.messaging_sub_intents
  (specialist_id, slug, name, recognition_cues, handling_instructions, autonomy, sort_order)
SELECT s.id, 'promo_raffle', 'Promo / raffle availability',
  'Customer references a live-stream giveaway, raffle, prize, or screenshots a promo offer with a raffle-style price (e.g. a watch "worth ¥19,900, raffled for ¥4,900"). This is NOT a regular stock listing.',
  'Do NOT call search_inventory and do NOT treat this as normal availability — a raffle entry is not inventory. Briefly acknowledge the promo, explain it is a raffle/giveaway (entry, not a direct sale), and hand off to staff for the mechanics. Never confirm "yes it is available" as if it were stock.',
  'DRAFT', 10
FROM public.messaging_specialists s WHERE s.slug = 'sales'
ON CONFLICT (specialist_id, slug) DO NOTHING;

-- shipment_status under Order & Tracking: report shipped/delivered from existing context.
INSERT INTO public.messaging_sub_intents
  (specialist_id, slug, name, recognition_cues, handling_instructions, autonomy, sort_order)
SELECT s.id, 'shipment_status', 'Has my order shipped / been delivered?',
  'Customer asks whether their order has shipped, where it is, or whether it has been delivered (e.g. "na-ship na po ba?", "where is my order", "delivered na?").',
  'Read tracking_number, shipped_date, and yamato_status for the customer''s order from the context block and report plainly: if shipped, say so and give the tracking number; if yamato_status is DELIVERED, confirm delivery warmly. NEVER invent a tracking number, date, or status that is not in the context. If no matching order is in context, ask which order they mean.',
  'DRAFT', 10
FROM public.messaging_specialists s WHERE s.slug = 'order_tracking'
ON CONFLICT (specialist_id, slug) DO NOTHING;
