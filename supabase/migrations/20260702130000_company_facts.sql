-- Structured company facts: ONE authoritative home for volatile values
-- (bank/SmartPit numbers, PayPal name, addresses, phones, shipping rates,
-- order-number format) that the messaging AI reads as fact. See
-- docs/superpowers/specs/2026-07-02-company-info-structured-facts-design.md
CREATE TABLE company_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  label       text NOT NULL,
  value_en    text NOT NULL,
  value_ja    text,
  category    text NOT NULL DEFAULT 'General',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_facts_active ON company_facts(is_active, category, sort_order);

ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON company_facts FOR ALL USING (auth.role() = 'authenticated');

-- Explicit Data-API grants (alongside RLS) per CLAUDE.md convention.
GRANT ALL ON public.company_facts TO anon, authenticated, service_role;
