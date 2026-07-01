# Company Info — Structured Facts Area (Design Spec)

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan
**Scope decision:** Canonical AI reference only (no template/KB de-duplication in this pass)

## Problem

Volatile company facts — bank / SmartPit account numbers, PayPal account name
("Yehey Japan Kabushiki Kaisha"), office / warehouse addresses, phone numbers, PH
shipping rates, and the order-number format (`YJ-XXXXXX`) — currently live as
free-text **prose sentences** scattered across `messaging_templates.content_en/ja`
**and** `knowledge_base.content`. There is no single home, so a value can drift when
a number changes.

**Goal:** give these values ONE structured home the messaging AI reads as
authoritative fact. This pass delivers a *canonical AI reference block* — it does
NOT rewrite templates/KB to reference the facts (that de-duplication is explicitly
out of scope).

## Non-goals

- Template / KB `{{variable}}` substitution against the facts (future work).
- Deleting or editing the existing prose in templates/KB.
- Any customer-facing surface — this is AI prompt context + staff admin only.

## Architecture

Four touch-points, mirroring the existing guardrails / knowledge-base flow:

| Piece | File | Change |
|---|---|---|
| DB | new migration | `company_facts` table + RLS + grants + seed |
| Loader | `supabase/functions/_shared/generate-draft.ts` | fetch active facts, pass to prompt builder |
| Renderer | `supabase/functions/_shared/build-specialist-prompt.ts` | new pure fn renders a `# Company Facts` block |
| Admin UI | `src/pages/admin/messaging-settings.tsx`, `src/services/messaging.ts`, `src/lib/types.ts` | new "Company Facts" section (list / add / edit / delete / toggle / reorder) |

No changes to `messaging_templates` or `knowledge_base` content. Facts are a
separate authoritative block.

## Schema

```sql
CREATE TABLE company_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,        -- stable slug: 'paypal_account_name'
  label       text NOT NULL,               -- human label: 'PayPal account name'
  value_en    text NOT NULL,
  value_ja    text,                        -- nullable; most facts leave this empty
  category    text NOT NULL DEFAULT 'General',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_facts_active ON company_facts(is_active, category, sort_order);

ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON company_facts FOR ALL USING (auth.role() = 'authenticated');

-- Data-API grants per project convention (ALTER DEFAULT PRIVILEGES already covers
-- new tables, but be explicit alongside RLS):
GRANT ALL ON public.company_facts TO anon, authenticated, service_role;
```

- `key` — stable unique slug; the admin form auto-generates it from the label
  (editable) so staff never hand-type it. Not shown in the prompt.
- `category` — free-text grouping column. Seeded categories: **Company · Payment ·
  Banking · Shipping · Contact · Orders**.
- `value_ja` — optional; only a few facts (e.g. addresses, bank holder name) use it.

## Prompt rendering (`build-specialist-prompt.ts`)

Add `companyFacts?: CompanyFact[]` to `BuildSpecialistPromptArgs` and a
`CompanyFact` interface (`key`, `label`, `value_en`, `value_ja`, `category`).

Rendered as its own top-level section, placed **after the persona and before the
Specialist Playbooks section** — high enough that the AI treats it as ground truth.
Grouped by category (categories emitted in first-seen order from the already-sorted
input; facts within a category keep loader order):

```
# Company Facts (authoritative — use these EXACT values; never invent account
numbers, company names, addresses, or rates. If a needed fact is missing, escalate.)

## Payment
- PayPal account name: Yehey Japan Kabushiki Kaisha
- SmartPit number: 1234-5678-9012

## Banking
- Bank account name: Yehey Japan K.K. (JA: ヤヘイジャパン株式会社)

## Orders
- Order number format: YJ-XXXXXX
```

Per-fact line: `- {label}: {value_en}`, with ` (JA: {value_ja})` appended only when
`value_ja` is non-empty. The entire block (including the `# Company Facts` header) is
omitted when there are no active facts. Pure function — unit-testable like the
existing prompt tests.

## Loader (`generate-draft.ts`)

Alongside the existing KB fetch:

```ts
const { data: factRows } = await supabase
  .from('company_facts')
  .select('key, label, value_en, value_ja, category, sort_order')
  .eq('is_active', true)
  .order('category')
  .order('sort_order');
const companyFacts = (factRows ?? []) as CompanyFact[];
```

Passed into `buildSpecialistSystemPrompt({ ..., companyFacts })`. Because the Test
Playground runs the same `generate-draft` path, facts appear there automatically —
no separate wiring.

## Admin UI (`messaging-settings.tsx` + `messaging.ts` + `types.ts`)

A new **"Company Facts"** card, styled like the existing Guardrails / Knowledge Base
sections:

- List grouped by category; each row shows label + `value_en` (+ `value_ja` when
  present) + active toggle + up/down reorder + edit/delete.
- Dialog form fields: **Category, Label, Key (auto-generated from label, editable),
  Value (EN), Value (JA, optional)**.

New service hooks in `src/services/messaging.ts`, mirroring the KB hooks:
`useCompanyFacts`, `useCreateCompanyFact`, `useUpdateCompanyFact`,
`useDeleteCompanyFact`.

New `CompanyFact` (+ insert/update) types added **by hand** to `src/lib/types.ts` —
never regenerated via `gen types` (per the types.ts hand-maintained convention).

## Seed data

The migration seeds rows extracted from the current KB + templates. Exact live
values are pulled during implementation and **shown to Joey to correct before the
seed is finalized**. Planned facts:

- **Orders:** order number format (`YJ-XXXXXX`)
- **Payment:** PayPal account name, SmartPit number, accepted-methods summary
- **Banking:** bank name, branch, account type, account number, account holder name (EN + JA)
- **Shipping:** domestic ¥1,000 fee, PH / LBC rate structure, max gadgets per order
- **Company:** legal name (Yehey Japan K.K.), office / warehouse address (EN + JA)
- **Contact:** phone number(s)

## Testing

Unit tests for the new render function in `build-specialist-prompt.ts`:

- grouping by category (correct headers, order preserved)
- JA suffix present when `value_ja` set, absent when null/empty
- whole block omitted when the facts list is empty

Matches the existing pure-function test style for the prompt builder.
