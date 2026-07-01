-- Let messaging_templates participate in the AI knowledge taxonomy so the AI can read
-- canned replies live at draft time (canned-response/AI consolidation, Phase 1).

ALTER TABLE public.messaging_templates
  ADD COLUMN IF NOT EXISTS specialist_slug text,
  ADD COLUMN IF NOT EXISTS sub_intent_slug text,
  ADD COLUMN IF NOT EXISTS ai_usage text NOT NULL DEFAULT 'REFERENCE'
    CHECK (ai_usage IN ('AUTO','DRAFT','REFERENCE','OFF'));

COMMENT ON COLUMN public.messaging_templates.specialist_slug IS
  'messaging_specialists.slug this canned reply belongs to (null = shown to all specialists).';
COMMENT ON COLUMN public.messaging_templates.sub_intent_slug IS
  'optional finer messaging_sub_intents.slug scope (null = whole specialist).';
COMMENT ON COLUMN public.messaging_templates.ai_usage IS
  'AUTO=may auto-send near-verbatim; DRAFT=AI may use, human approves; REFERENCE=AI reads as fact only, never verbatim; OFF=hidden from AI.';

-- Seed the taxonomy for the current 20 (approved 2026-07-01; staff refine later in the UI).
UPDATE public.messaging_templates SET specialist_slug='sales' WHERE name IN
  ('Info: Probing','Info: Basic Greeting','Info: Express Service','Info: Ranking and Warranty','Order: Special Request','Order: Offer Link');
UPDATE public.messaging_templates SET specialist_slug='order_tracking' WHERE name IN
  ('Order: How to Checkout','Order: Manual Process','Order: Japan Invoice','Order: Philippines Invoice','Tracking: LBC','Tracking: Yamato','Acctg: Payment Confirmation','Acctg: PayPal Payment','Acctg: SmartPit Payment','Concern: Redelivery','Concern: Warehouse Address');
UPDATE public.messaging_templates SET specialist_slug='aftersales' WHERE name IN ('After: Feedback','Lost');
UPDATE public.messaging_templates SET specialist_slug='generalist' WHERE name IN ('Office Location');

-- ai_usage: self-contained → AUTO; payment-link → DRAFT; everything with human blanks keeps REFERENCE default.
UPDATE public.messaging_templates SET ai_usage='AUTO' WHERE name IN
  ('After: Feedback','Lost','Office Location','Concern: Warehouse Address','Concern: Redelivery',
   'Info: Basic Greeting','Info: Express Service','Info: Probing','Info: Ranking and Warranty',
   'Order: How to Checkout','Acctg: Payment Confirmation');
UPDATE public.messaging_templates SET ai_usage='DRAFT' WHERE name IN ('Acctg: PayPal Payment');
