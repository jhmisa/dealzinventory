-- Plan 3b: specialist playbooks.
-- 1) Per-specialist playbooks (DB-editable). One row per specialist; `intents` lists the
--    emitted AI intents it owns. always_escalate forces needs_human_review for those intents.
CREATE TABLE IF NOT EXISTS messaging_specialists (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  intents            text[] NOT NULL DEFAULT '{}',
  playbook           text NOT NULL DEFAULT '',
  always_escalate    boolean NOT NULL DEFAULT false,
  auto_send_eligible boolean NOT NULL DEFAULT false,  -- reserved for Phase 2/3 autonomy; unused now
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messaging_specialists_active
  ON messaging_specialists(is_active, sort_order);

ALTER TABLE messaging_specialists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff full access" ON messaging_specialists;
CREATE POLICY "Staff full access" ON messaging_specialists
  FOR ALL USING (auth.role() = 'authenticated');

-- Explicit grants (RLS still gates row access). Belt-and-suspenders per CLAUDE.md.
GRANT ALL ON public.messaging_specialists TO anon, authenticated, service_role;

-- 2) KB tagging: which specialist(s) an article belongs under. Empty = shared (General Knowledge).
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS specialist_tags text[] NOT NULL DEFAULT '{}';

-- 3) Seed the five specialists with starter playbooks distilled from existing KB/guardrails.
INSERT INTO messaging_specialists (slug, name, intents, playbook, always_escalate, sort_order) VALUES
  ('sales', 'Sales', ARRAY['product_inquiry'],
   E'You handle product availability, specs, and recommendations.\n- If the request is vague, ask qualifying questions: device type (laptop/phone/tablet), brand preference, budget, key specs.\n- Recommend matching in-stock items with: brand & model, key specs (CPU/chipset, RAM, storage, OS), condition grade and what it means, price in yen, and the G-code.\n- Suggest relevant in-stock accessories (chargers, cases, screen protectors).\n- If nothing matches, say so and invite the customer to check back.\n- Selling prices from our shop are public and safe to share. NEVER reveal buying prices, costs, or suppliers.',
   false, 1),
  ('order_tracking', 'Order & Tracking', ARRAY['tracking','order_status'],
   E'You handle order status, tracking, and delivery questions.\n- Use the order context provided to you; state the current status plainly.\n- We ship via Yamato Transport within Japan; standard delivery is 2-3 business days.\n- Share the tracking number ONLY once the order is SHIPPED, and point to kuronekoyamato.co.jp.\n- Never invent tracking numbers or delivery dates you do not have.',
   false, 2),
  ('aftersales', 'Aftersales', ARRAY['return','complaint'],
   E'You handle returns, defects, and complaints.\n- Be empathetic and apologize for any trouble.\n- NEVER promise or guarantee a refund, replacement, or return. Always say you will escalate to a manager for review.\n- Gather: order code, what is wrong, and photos if it is a defect.\n- State the return window: the customer must contact us within 7 days of delivery.\n- Always escalate; never resolve quality complaints autonomously.',
   true, 3),
  ('kaitori', 'Kaitori', ARRAY['kaitori'],
   E'You handle customers selling their devices to us (buy-back).\n- Explain the process: submit a request with device details + photos, receive an auto-quote, ship or bring the device in, we inspect and confirm or revise, payment by bank transfer.\n- Valid ID (本人確認) and bank details are required before payment.\n- NEVER state, confirm, or negotiate a final buy-back price. Always escalate quotes and money matters to staff.',
   true, 4),
  ('generalist', 'Generalist', ARRAY['general','unknown'],
   E'You handle general questions that do not fit another specialist.\n- Be helpful and concise.\n- If the customer''s need is unclear, ask one short clarifying question rather than guessing.\n- If the topic is actually sales, an order, a return/complaint, or kaitori, follow that specialist''s playbook instead.',
   false, 5)
ON CONFLICT (slug) DO NOTHING;

-- 4) Tag existing KB articles to their specialist(s). Guardrails stay shared (always rendered).
UPDATE knowledge_base SET specialist_tags = ARRAY['order_tracking'] WHERE title = 'Shipping Information';
UPDATE knowledge_base SET specialist_tags = ARRAY['order_tracking'] WHERE title = 'Payment Methods';
UPDATE knowledge_base SET specialist_tags = ARRAY['sales','aftersales'] WHERE title = 'Condition Grades';
UPDATE knowledge_base SET specialist_tags = ARRAY['aftersales'] WHERE title = 'Return Policy';
UPDATE knowledge_base SET specialist_tags = ARRAY['kaitori'] WHERE title = 'Kaitori (Buy-back) Process';
UPDATE knowledge_base SET specialist_tags = ARRAY['sales'] WHERE title = 'Handling Product Inquiries';
-- 'Tagalog/Filipino Text-Speak Guide' intentionally left shared (applies to every specialist).

-- Keep updated_at fresh on edits (matches sibling messaging tables).
DROP TRIGGER IF EXISTS set_messaging_specialists_updated_at ON messaging_specialists;
CREATE TRIGGER set_messaging_specialists_updated_at
  BEFORE UPDATE ON messaging_specialists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
