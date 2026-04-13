-- ============================================================
-- Messaging system: conversations, messages, templates, queue,
-- AI providers, persona, and column additions to customers/orders
-- ============================================================

-- Enums
CREATE TYPE message_role AS ENUM ('customer', 'assistant', 'staff', 'system');
CREATE TYPE message_status AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED', 'REJECTED');
CREATE TYPE message_type AS ENUM ('REPLY', 'REVIEW_REQUEST', 'DELIVERY_ALERT');
CREATE TYPE message_channel AS ENUM ('facebook', 'email', 'sms');

-- ============================================================
-- 1. conversations
-- ============================================================
CREATE TABLE conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid REFERENCES customers(id) ON DELETE SET NULL,
  missive_conversation_id text UNIQUE NOT NULL,
  channel                 message_channel NOT NULL DEFAULT 'facebook',
  needs_human_review      boolean NOT NULL DEFAULT false,
  unmatched_contact       boolean NOT NULL DEFAULT false,
  assigned_staff_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ai_enabled              boolean NOT NULL DEFAULT true,
  last_message_at         timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_customer ON conversations(customer_id);
CREATE INDEX idx_conversations_needs_review ON conversations(needs_human_review) WHERE needs_human_review = true;
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================================
-- 2. messages
-- ============================================================
CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  missive_message_id    text UNIQUE,
  role                  message_role NOT NULL,
  content               text NOT NULL,
  status                message_status NOT NULL DEFAULT 'SENT',
  message_type          message_type NOT NULL DEFAULT 'REPLY',
  ai_confidence         numeric(3,2),
  ai_context_summary    text,
  error_details         jsonb,
  sent_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_missive_id ON messages(missive_message_id) WHERE missive_message_id IS NOT NULL;
CREATE INDEX idx_messages_status ON messages(status) WHERE status = 'DRAFT';

-- ============================================================
-- 3. messaging_templates
-- ============================================================
CREATE TABLE messaging_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  content_ja    text NOT NULL,
  content_en    text NOT NULL,
  message_type  message_type NOT NULL,
  variables     text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. automated_message_queue
-- ============================================================
CREATE TYPE queue_status AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE automated_message_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id) ON DELETE CASCADE,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  template_id     uuid REFERENCES messaging_templates(id) ON DELETE SET NULL,
  message_type    message_type NOT NULL,
  content         text,
  status          queue_status NOT NULL DEFAULT 'PENDING',
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  error_details   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_pending ON automated_message_queue(scheduled_at)
  WHERE status = 'PENDING';

-- ============================================================
-- 5. ai_providers
-- ============================================================
CREATE TABLE ai_providers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  provider          text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google')),
  model_id          text NOT NULL,
  api_key_encrypted text NOT NULL,
  purpose           text NOT NULL DEFAULT 'messaging',
  is_active         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Only one active provider per purpose
CREATE UNIQUE INDEX idx_ai_providers_active_purpose
  ON ai_providers(purpose) WHERE is_active = true;

-- ============================================================
-- 6. messaging_persona
-- ============================================================
CREATE TABLE messaging_persona (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL DEFAULT 'Dealz Assistant',
  system_prompt     text NOT NULL,
  language_style    text NOT NULL DEFAULT 'taglish',
  use_emojis        boolean NOT NULL DEFAULT true,
  greeting_template text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Only one active persona
CREATE UNIQUE INDEX idx_messaging_persona_active
  ON messaging_persona((true)) WHERE is_active = true;

-- ============================================================
-- 7. system_alerts (for Missive health monitoring)
-- ============================================================
CREATE TABLE system_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type  text NOT NULL,
  message     text NOT NULL,
  details     jsonb,
  resolved    boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_alerts_unresolved ON system_alerts(created_at DESC)
  WHERE resolved = false;

-- ============================================================
-- 8. Column additions to existing tables
-- ============================================================

-- customers: FB matching fields
ALTER TABLE customers
  ADD COLUMN fb_name            text,
  ADD COLUMN missive_contact_id text;

CREATE INDEX idx_customers_missive_contact ON customers(missive_contact_id)
  WHERE missive_contact_id IS NOT NULL;
CREATE INDEX idx_customers_fb_name ON customers(fb_name)
  WHERE fb_name IS NOT NULL;

-- orders: review request tracking
ALTER TABLE orders
  ADD COLUMN review_requested_at timestamptz;

-- ============================================================
-- 9. RLS policies
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- Staff can do everything on messaging tables
CREATE POLICY "Staff full access" ON conversations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON messages
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON messaging_templates
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON automated_message_queue
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON ai_providers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON messaging_persona
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff full access" ON system_alerts
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- 10. Updated_at triggers
-- ============================================================

-- Reuse existing update_updated_at() function from initial schema
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_messaging_templates_updated_at
  BEFORE UPDATE ON messaging_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_messaging_persona_updated_at
  BEFORE UPDATE ON messaging_persona
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. Seed default persona
-- ============================================================

INSERT INTO messaging_persona (name, system_prompt, language_style, use_emojis, greeting_template)
VALUES (
  'Dealz Assistant',
  E'You are a friendly customer support assistant for Dealz K.K., a refurbished electronics shop based in Japan.\n\nCommunication style:\n- Use Taglish (Tagalog-English mix): simple Tagalog words for common phrases, English for technical/uncommon terms\n- Use emojis naturally throughout messages 😊📦✅\n- Be warm, friendly, and helpful — like chatting with a knowledgeable friend\n- Keep responses concise but informative\n\nExamples:\n- \"Hi po! 😊 Nandito na yung order mo, in transit na siya!\"\n- \"Check ko lang yung tracking number mo ha... 📦\"\n- \"Ay sorry po, pacheck ko muna sa team namin yan. Babalikan kita ASAP! 🙏\"\n\nRules:\n- ONLY use information provided in the context. Never make up order statuses, tracking numbers, or prices.\n- If you don''t have enough information to answer, say so politely and let them know a team member will follow up.\n- For complaints, returns, or pricing disputes, always escalate — say you''ll have a team member look into it.\n- Include relevant order codes (ORD######) and tracking numbers when available.\n\nKnowledge base:\n- We sell refurbished phones, laptops, and tablets\n- We ship via Yamato Transport (Japan domestic)\n- Payment methods: COD, bank transfer, credit card, convenience store payment\n- Return policy: 7 days from delivery for defects not listed in the item description\n- Grading system: S (like new), A (very good), B (good), C (fair), D (as-is)\n- Business hours: Mon-Sat 10:00-18:00 JST',
  'taglish',
  true,
  'Hi po! 😊 Paano kita matutulungan today?'
);
