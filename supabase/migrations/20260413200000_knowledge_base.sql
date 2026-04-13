-- Knowledge base & guardrails for AI messaging
CREATE TYPE kb_entry_type AS ENUM ('knowledge', 'guardrail');

CREATE TABLE knowledge_base (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type  kb_entry_type NOT NULL DEFAULT 'knowledge',
  title       text NOT NULL,
  content     text NOT NULL,
  category    text NOT NULL DEFAULT 'Custom',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_base_active ON knowledge_base(is_active, sort_order);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON knowledge_base FOR ALL USING (auth.role() = 'authenticated');

-- Seed guardrails
INSERT INTO knowledge_base (entry_type, title, content, category, sort_order) VALUES
  ('guardrail', 'Never share selling or buying prices', 'You must NEVER disclose any selling prices, buying prices, profit margins, or cost information to customers. If asked, say pricing is available on our shop page or during live selling events.', 'Pricing', 0),
  ('guardrail', 'Never promise refunds without manager approval', 'You must NEVER promise or guarantee a refund, replacement, or return to a customer. Always say you will escalate to a manager for review. Set escalation_reason when this topic comes up.', 'Returns', 1),
  ('guardrail', 'Always escalate complaints about defective items', 'When a customer reports a defective item, damaged item, or quality complaint, always set confidence below 0.5 and provide an escalation_reason. Never attempt to resolve quality complaints autonomously.', 'Quality', 2);

-- Seed knowledge articles extracted from typical persona prompts
INSERT INTO knowledge_base (entry_type, title, content, category, sort_order) VALUES
  ('knowledge', 'Shipping Information', E'We ship via Yamato Transport (ヤマト運輸) within Japan.\n- Standard shipping: 2-3 business days\n- Tracking numbers are provided once the order is SHIPPED\n- Customers can track packages at kuronekoyamato.co.jp\n- We do not currently offer international shipping', 'Shipping', 0),
  ('knowledge', 'Condition Grades', E'Our grading system:\n- S: Brand new or open box, like-new condition\n- A: Very good — minimal signs of use\n- B: Good — light scratches or wear\n- C: Fair — visible wear but fully functional\n- D: As-is — major cosmetic issues, may have functional issues\n- J: Junk/parts only — NOT sold to customers', 'Products', 1),
  ('knowledge', 'Return Policy', E'Returns are handled on a case-by-case basis.\n- Customer must contact us within 7 days of delivery\n- Item must be in the same condition as received\n- Shipping costs for returns are the customer''s responsibility unless the item was misrepresented\n- Refunds are processed after we receive and inspect the returned item\n- Always escalate return requests to staff for approval', 'Returns', 2),
  ('knowledge', 'Payment Methods', E'We accept:\n- Bank transfer (振込) — most common\n- Cash on delivery (代引き) via Yamato\n- PayPay for in-person transactions\n- Payment must be confirmed before shipping', 'Payments', 3),
  ('knowledge', 'Kaitori (Buy-back) Process', E'Customers can sell their devices to us:\n1. Submit a Kaitori request with device details and photos\n2. We provide an auto-quote based on our price list\n3. Customer ships the device or brings it in person\n4. We inspect and confirm or revise the price\n5. Payment is made via bank transfer\n- Seller must provide valid ID (本人確認)\n- Bank details required for payment', 'Kaitori', 4);
