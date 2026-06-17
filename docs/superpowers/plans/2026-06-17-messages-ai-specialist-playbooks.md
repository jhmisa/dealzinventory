# Messages AI — Specialist Playbooks (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the messaging AI five DB-editable specialist playbooks (Sales, Order & Tracking, Aftersales, Kaitori, Generalist) plus per-intent KB tagging, so each topic gets a sharper reply and per-topic escalation control — all inside one existing model call.

**Architecture:** Approach A (single call, model self-selects). A new pure helper `build-specialist-prompt.ts` assembles the system prompt: guardrails + base persona + a "Specialist Playbooks" section (each playbook with its tagged KB grouped beneath) + a shared "General Knowledge" section. The model classifies the `intent` (as it already does) and follows the matching playbook. After the call, escalation is enforced in code from the matched specialist's `always_escalate` flag. The helper is shared by both `generate-draft.ts` (cron path) and `test-ai-reply` (Playground).

**Tech Stack:** Supabase Postgres (migration + RLS), Deno Edge Functions (TypeScript), React 18 + Vite + TypeScript, TanStack Query, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-17-messages-ai-specialist-playbooks-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/20260617130000_specialist_playbooks.sql` — `messaging_specialists` table, `knowledge_base.specialist_tags` column, RLS, grants, seed specialists, KB tagging.
- `supabase/functions/_shared/build-specialist-prompt.ts` — pure prompt-assembly helper + `specialistForIntent` resolver + shared types.
- `supabase/functions/_shared/build-specialist-prompt.test.ts` — Deno unit tests.

**Modify:**
- `supabase/functions/_shared/generate-draft.ts` — load specialists, use the helper, escalate via `always_escalate`.
- `supabase/functions/test-ai-reply/index.ts` — load specialists, use the helper.
- `supabase/functions/_shared/intent-routing.ts` — remove `isEscalatingIntent` (escalation moves to specialist flag).
- `supabase/functions/_shared/intent-routing.test.ts` — drop the `isEscalatingIntent` test.
- `src/lib/types.ts` — `MessagingSpecialist` types; add `specialist_tags` to KB types.
- `src/services/messaging.ts` — `getSpecialists`, `updateSpecialist`.
- `src/lib/query-keys.ts` — `specialists` key.
- `src/hooks/use-messaging.ts` — `useSpecialists`, `useUpdateSpecialist`.
- `src/pages/admin/messaging-settings.tsx` — Specialists editor section + KB specialist-tags selector.

---

## Task 1: Database migration (table + KB column + seed)

**Files:**
- Create: `supabase/migrations/20260617130000_specialist_playbooks.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260617130000_specialist_playbooks.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration `20260617130000_specialist_playbooks` applies with no error.

- [ ] **Step 3: Verify the table + seed**

Run (via Supabase MCP `execute_sql` or `supabase db` SQL):
```sql
SELECT slug, intents, always_escalate, sort_order FROM messaging_specialists ORDER BY sort_order;
SELECT title, specialist_tags FROM knowledge_base WHERE entry_type = 'knowledge' ORDER BY sort_order;
```
Expected: 5 specialist rows (aftersales + kaitori have `always_escalate = true`); KB articles show the tags above, Tagalog guide shows `{}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617130000_specialist_playbooks.sql
git commit -m "feat(ai): add messaging_specialists table + knowledge_base.specialist_tags"
```

---

## Task 2: Pure prompt-assembly helper + resolver (TDD)

**Files:**
- Create: `supabase/functions/_shared/build-specialist-prompt.ts`
- Test: `supabase/functions/_shared/build-specialist-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/build-specialist-prompt.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  buildSpecialistSystemPrompt,
  specialistForIntent,
  type SpecialistRow,
} from './build-specialist-prompt.ts';

const SPECIALISTS: SpecialistRow[] = [
  { slug: 'sales', name: 'Sales', intents: ['product_inquiry'], playbook: 'SALES_PLAY', always_escalate: false, is_active: true, sort_order: 1 },
  { slug: 'order_tracking', name: 'Order & Tracking', intents: ['tracking', 'order_status'], playbook: 'ORDER_PLAY', always_escalate: false, is_active: true, sort_order: 2 },
  { slug: 'aftersales', name: 'Aftersales', intents: ['return', 'complaint'], playbook: 'AFTER_PLAY', always_escalate: true, is_active: true, sort_order: 3 },
  { slug: 'generalist', name: 'Generalist', intents: ['general', 'unknown'], playbook: 'GEN_PLAY', always_escalate: false, is_active: true, sort_order: 5 },
];

Deno.test('specialistForIntent resolves each intent to its owning specialist', () => {
  assertEquals(specialistForIntent('product_inquiry', SPECIALISTS)?.slug, 'sales');
  assertEquals(specialistForIntent('tracking', SPECIALISTS)?.slug, 'order_tracking');
  assertEquals(specialistForIntent('order_status', SPECIALISTS)?.slug, 'order_tracking');
  assertEquals(specialistForIntent('return', SPECIALISTS)?.slug, 'aftersales');
  assertEquals(specialistForIntent('complaint', SPECIALISTS)?.slug, 'aftersales');
  assertEquals(specialistForIntent('general', SPECIALISTS)?.slug, 'generalist');
  assertEquals(specialistForIntent('unknown', SPECIALISTS)?.slug, 'generalist');
});

Deno.test('specialistForIntent returns null when no active specialist owns the intent', () => {
  assertEquals(specialistForIntent('kaitori', SPECIALISTS), null);
  assertEquals(specialistForIntent('garbage', SPECIALISTS), null);
});

Deno.test('specialistForIntent ignores inactive specialists', () => {
  const withInactive: SpecialistRow[] = [
    { slug: 'sales', name: 'Sales', intents: ['product_inquiry'], playbook: '', always_escalate: false, is_active: false, sort_order: 1 },
  ];
  assertEquals(specialistForIntent('product_inquiry', withInactive), null);
});

Deno.test('specialistForIntent breaks ties by lowest sort_order', () => {
  const dup: SpecialistRow[] = [
    { slug: 'b', name: 'B', intents: ['x'], playbook: '', always_escalate: false, is_active: true, sort_order: 9 },
    { slug: 'a', name: 'A', intents: ['x'], playbook: '', always_escalate: false, is_active: true, sort_order: 2 },
  ];
  assertEquals(specialistForIntent('x', dup)?.slug, 'a');
});

Deno.test('buildSpecialistSystemPrompt assembles all sections in order', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [{ title: 'No prices', content: 'Never share costs.' }],
    personaSystemPrompt: 'PERSONA_BODY',
    knowledge: [
      { title: 'Shipping', content: 'Yamato 2-3 days.', specialist_tags: ['order_tracking'] },
      { title: 'Tagalog Guide', content: 'po = polite.', specialist_tags: [] },
    ],
    specialists: SPECIALISTS,
  });

  // Guardrails first, numbered + bolded
  assertStringIncludes(prompt, '# Rules (NEVER violate)');
  assertStringIncludes(prompt, '1. **No prices**: Never share costs.');
  // Persona body
  assertStringIncludes(prompt, 'PERSONA_BODY');
  // Specialist section with playbooks
  assertStringIncludes(prompt, '# Specialist Playbooks');
  assertStringIncludes(prompt, '## Sales — product inquiry');
  assertStringIncludes(prompt, 'SALES_PLAY');
  assertStringIncludes(prompt, '## Order & Tracking — tracking, order status');
  // Tagged KB grouped under its specialist
  assertStringIncludes(prompt, 'Relevant knowledge:');
  assertStringIncludes(prompt, '### Shipping');
  // Shared KB in General Knowledge
  assertStringIncludes(prompt, '# General Knowledge');
  assertStringIncludes(prompt, '## Tagalog Guide');
});

Deno.test('buildSpecialistSystemPrompt puts orphaned-tag KB into General Knowledge', () => {
  // Article tagged only for a specialist that is not active -> must not vanish.
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'P',
    knowledge: [{ title: 'Kaitori Steps', content: 'steps', specialist_tags: ['kaitori'] }],
    specialists: SPECIALISTS, // no active 'kaitori' specialist in this fixture
  });
  assertStringIncludes(prompt, '# General Knowledge');
  assertStringIncludes(prompt, '## Kaitori Steps');
});

Deno.test('buildSpecialistSystemPrompt omits the specialist section when none are active', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'PERSONA',
    knowledge: [{ title: 'A', content: 'a', specialist_tags: [] }],
    specialists: [],
  });
  assertEquals(prompt.includes('# Specialist Playbooks'), false);
  assertStringIncludes(prompt, 'PERSONA');
  assertStringIncludes(prompt, '# General Knowledge');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: FAIL — module `./build-specialist-prompt.ts` not found.

- [ ] **Step 3: Write the helper**

Create `supabase/functions/_shared/build-specialist-prompt.ts`:

```ts
// Specialist-playbook prompt assembly for the messaging AI (Plan 3b).
//
// Approach A: one model call. The system prompt embeds every active specialist's playbook (with its
// tagged knowledge grouped beneath); the model classifies the intent and follows the matching one.
// These are pure functions so they can be unit-tested without a DB.

export interface SpecialistRow {
  slug: string;
  name: string;
  intents: string[];
  playbook: string;
  always_escalate: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface GuardrailEntry {
  title: string;
  content: string;
}

export interface KnowledgeEntry {
  title: string;
  content: string;
  specialist_tags: string[];
}

export interface BuildSpecialistPromptArgs {
  guardrails: GuardrailEntry[];
  personaSystemPrompt: string;
  knowledge: KnowledgeEntry[];
  specialists: SpecialistRow[];
}

// "tracking, order_status" -> "tracking, order status" (human-readable intent list for headers).
function humanIntents(intents: string[]): string {
  return intents.map((i) => i.replace(/_/g, ' ')).join(', ');
}

// Resolve an emitted intent to its owning active specialist. Ties (should not happen with the
// seeded data) break by lowest sort_order. Returns null when no active specialist owns the intent.
export function specialistForIntent(
  intent: string,
  specialists: SpecialistRow[],
): SpecialistRow | null {
  const matches = specialists
    .filter((s) => s.is_active && s.intents.includes(intent))
    .sort((a, b) => a.sort_order - b.sort_order);
  return matches[0] ?? null;
}

export function buildSpecialistSystemPrompt(args: BuildSpecialistPromptArgs): string {
  const { guardrails, personaSystemPrompt, knowledge, specialists } = args;
  let prompt = '';

  // 1. Guardrails — always all, numbered + bolded.
  if (guardrails.length > 0) {
    const rules = guardrails
      .map((g, i) => `${i + 1}. **${g.title}**: ${g.content}`)
      .join('\n');
    prompt += `# Rules (NEVER violate)\n${rules}\n\n`;
  }

  // 2. Base persona.
  prompt += personaSystemPrompt;

  // 3. Specialist playbooks (active, sorted), each with its tagged knowledge.
  const active = specialists
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const activeSlugs = new Set(active.map((s) => s.slug));

  if (active.length > 0) {
    prompt +=
      `\n\n# Specialist Playbooks\nIdentify which specialist the customer's message fits, then follow ONLY that playbook.`;
    for (const s of active) {
      prompt += `\n\n## ${s.name} — ${humanIntents(s.intents)}\n${s.playbook}`;
      const tagged = knowledge.filter((k) => k.specialist_tags.some((t) => t === s.slug));
      if (tagged.length > 0) {
        const articles = tagged.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
        prompt += `\nRelevant knowledge:\n${articles}`;
      }
    }
  }

  // 4. Shared knowledge: untagged, OR tagged only for specialists that are not active (so nothing
  //    silently disappears).
  const shared = knowledge.filter(
    (k) => k.specialist_tags.length === 0 || !k.specialist_tags.some((t) => activeSlugs.has(t)),
  );
  if (shared.length > 0) {
    const articles = shared.map((k) => `## ${k.title}\n${k.content}`).join('\n\n');
    prompt += `\n\n# General Knowledge\n${articles}`;
  }

  return prompt;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/build-specialist-prompt.ts supabase/functions/_shared/build-specialist-prompt.test.ts
git commit -m "feat(ai): add specialist prompt-assembly helper + intent resolver"
```

---

## Task 3: Wire the helper into generate-draft.ts (cron path)

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Update imports**

In `supabase/functions/_shared/generate-draft.ts`, replace the intent-routing import line (line 6):

```ts
import { folderNameForIntent, shouldRouteOutOfInbox, isEscalatingIntent } from "./intent-routing.ts";
```

with:

```ts
import { folderNameForIntent, shouldRouteOutOfInbox } from "./intent-routing.ts";
import {
  buildSpecialistSystemPrompt,
  specialistForIntent,
  type SpecialistRow,
} from "./build-specialist-prompt.ts";
```

- [ ] **Step 2: Load specialists + rebuild the prompt via the helper**

Replace the whole block from line 40 (`// 2b. Fetch active guardrails...`) through line 68 (end of the knowledge-base `if` that builds `fullSystemPrompt`) with:

```ts
  // 2b. Fetch active guardrails + knowledge base entries (with specialist tags).
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('entry_type, title, content, specialist_tags')
    .eq('is_active', true)
    .order('sort_order');

  const entries = (kbEntries ?? []) as Array<{
    entry_type: string;
    title: string;
    content: string;
    specialist_tags: string[] | null;
  }>;
  const guardrails = entries
    .filter((e) => e.entry_type === 'guardrail')
    .map((e) => ({ title: e.title, content: e.content }));
  const knowledge = entries
    .filter((e) => e.entry_type === 'knowledge')
    .map((e) => ({ title: e.title, content: e.content, specialist_tags: e.specialist_tags ?? [] }));

  // 2c. Fetch active specialists (per-topic playbooks).
  const { data: specialistRows } = await supabase
    .from('messaging_specialists')
    .select('slug, name, intents, playbook, always_escalate, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  const specialists = (specialistRows ?? []) as SpecialistRow[];

  // Build full system prompt: guardrails → persona → specialist playbooks → shared knowledge.
  const fullSystemPrompt = buildSpecialistSystemPrompt({
    guardrails,
    personaSystemPrompt: persona.system_prompt,
    knowledge,
    specialists,
  });
```

- [ ] **Step 3: Switch escalation to the specialist's always_escalate flag**

Replace the `needsReview` block (currently lines ~117-122):

```ts
  // 6. Determine if human review is needed.
  // Sensitive intents (kaitori = money, complaint) always escalate regardless of confidence.
  const needsReview =
    aiResponse.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    isEscalatingIntent(aiResponse.intent);
```

with:

```ts
  // 6. Determine if human review is needed. The matched specialist's always_escalate flag is the
  // authoritative, DB-editable escalation rule (Aftersales + Kaitori escalate by default).
  const matchedSpecialist = specialistForIntent(aiResponse.intent, specialists);
  const needsReview =
    aiResponse.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    matchedSpecialist?.always_escalate === true;
```

- [ ] **Step 4: Type-check the edge function**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors. (Pre-existing `never`-type errors on the untyped Supabase client `.insert/.update/.select` are NOT regressions — they exist on `main` today. If `deno check` surfaces only those, that is acceptable.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): build draft prompt from specialist playbooks; escalate via specialist flag"
```

---

## Task 4: Remove the superseded isEscalatingIntent helper

**Files:**
- Modify: `supabase/functions/_shared/intent-routing.ts`
- Modify: `supabase/functions/_shared/intent-routing.test.ts`

- [ ] **Step 1: Delete the escalation helper from intent-routing.ts**

In `supabase/functions/_shared/intent-routing.ts`, delete these lines (the comment block + set + function, currently lines 40-46):

```ts
// Sensitive intents that always need a human regardless of confidence (bias to escalate):
// money (kaitori) and complaints. Feeds the existing needs_human_review flag.
const ESCALATING_INTENTS = new Set(['kaitori', 'complaint']);

export function isEscalatingIntent(intent: string): boolean {
  return ESCALATING_INTENTS.has(intent);
}
```

Leave `folderNameForIntent` and `shouldRouteOutOfInbox` intact.

- [ ] **Step 2: Delete the corresponding test**

In `supabase/functions/_shared/intent-routing.test.ts`, delete the entire final test:

```ts
Deno.test('isEscalatingIntent is true only for kaitori and complaint', () => {
  ...
});
```

and remove `isEscalatingIntent` from the import block at the top of the file (leave `folderNameForIntent`, `shouldRouteOutOfInbox`).

- [ ] **Step 3: Run the routing tests + type-check**

Run: `deno test supabase/functions/_shared/intent-routing.test.ts`
Expected: PASS (no reference to `isEscalatingIntent`).

Run: `grep -rn "isEscalatingIntent" supabase/functions/`
Expected: no matches (fully removed).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/intent-routing.ts supabase/functions/_shared/intent-routing.test.ts
git commit -m "refactor(ai): drop isEscalatingIntent (escalation now via specialist flag)"
```

---

## Task 5: Wire the helper into test-ai-reply (Playground path)

**Files:**
- Modify: `supabase/functions/test-ai-reply/index.ts`

- [ ] **Step 1: Add the helper import**

In `supabase/functions/test-ai-reply/index.ts`, add below the existing `generateAIReply` import (line 4):

```ts
import { buildSpecialistSystemPrompt, type SpecialistRow } from "../_shared/build-specialist-prompt.ts";
```

- [ ] **Step 2: Replace the duplicated prompt-building block**

Replace the block from the KB fetch comment (line 68 `// Fetch active guardrails + knowledge base`) through the end of the `fullSystemPrompt` knowledge `if` (line 95) with:

```ts
    // Fetch active guardrails + knowledge base (with specialist tags)
    const { data: kbEntries } = await supabase
      .from('knowledge_base')
      .select('entry_type, title, content, specialist_tags')
      .eq('is_active', true)
      .order('sort_order');

    const entries = (kbEntries ?? []) as Array<{
      entry_type: string;
      title: string;
      content: string;
      specialist_tags: string[] | null;
    }>;
    const guardrails = entries
      .filter((e) => e.entry_type === 'guardrail')
      .map((e) => ({ title: e.title, content: e.content }));
    const knowledge = entries
      .filter((e) => e.entry_type === 'knowledge')
      .map((e) => ({ title: e.title, content: e.content, specialist_tags: e.specialist_tags ?? [] }));

    // Fetch active specialists (per-topic playbooks)
    const { data: specialistRows } = await supabase
      .from('messaging_specialists')
      .select('slug, name, intents, playbook, always_escalate, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    const specialists = (specialistRows ?? []) as SpecialistRow[];

    const fullSystemPrompt = buildSpecialistSystemPrompt({
      guardrails,
      personaSystemPrompt: persona.system_prompt,
      knowledge,
      specialists,
    });
```

> Note: this assumes the persona is fetched into a `persona` variable above (it is — line 56 fetches `messaging_persona`). If the local variable name differs, use the existing name; do not change the persona fetch.

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/test-ai-reply/index.ts`
Expected: no new errors (pre-existing untyped-client `never` errors acceptable, as in Task 3).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/test-ai-reply/index.ts
git commit -m "refactor(ai): test-ai-reply uses shared specialist prompt helper"
```

---

## Task 6: Frontend types, service, query-keys, hooks

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/services/messaging.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/hooks/use-messaging.ts`

- [ ] **Step 1: Add specialist types + KB tag field in types.ts**

In `src/lib/types.ts`, add `specialist_tags: string[]` to `KnowledgeBaseEntry` (after `category: string`), and `specialist_tags?: string[]` to both `KnowledgeBaseEntryInsert` and `KnowledgeBaseEntryUpdate` (after their `category` lines).

Then add, right after the `KnowledgeBaseEntryUpdate` interface:

```ts
// Messaging Specialists (per-topic playbooks)
export interface MessagingSpecialist {
  id: string
  slug: string
  name: string
  intents: string[]
  playbook: string
  always_escalate: boolean
  auto_send_eligible: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MessagingSpecialistUpdate {
  playbook?: string
  always_escalate?: boolean
  is_active?: boolean
}
```

- [ ] **Step 2: Add service functions in messaging.ts**

In `src/services/messaging.ts`, add `MessagingSpecialist` and `MessagingSpecialistUpdate` to the type import block (alongside `MessagingPersona`). Then add, right after `deleteKnowledgeBaseEntry` (line ~550):

```ts
// ---------- Specialists ----------

export async function getSpecialists() {
  const { data, error } = await supabase
    .from('messaging_specialists')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as MessagingSpecialist[]
}

export async function updateSpecialist(id: string, updates: MessagingSpecialistUpdate) {
  const { data, error } = await supabase
    .from('messaging_specialists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MessagingSpecialist
}
```

- [ ] **Step 3: Add the query key**

In `src/lib/query-keys.ts`, inside the `messaging` block, add after the `knowledgeBase` line (line 234):

```ts
    specialists: () => [...queryKeys.messaging.all, 'specialists'] as const,
```

- [ ] **Step 4: Add hooks in use-messaging.ts**

In `src/hooks/use-messaging.ts`, add `MessagingSpecialistUpdate` to the type import block, then add after `useDeleteKnowledgeBaseEntry` (line ~322):

```ts
// ---------- Specialists ----------

export function useSpecialists() {
  return useQuery({
    queryKey: queryKeys.messaging.specialists(),
    queryFn: () => messagingService.getSpecialists(),
  })
}

export function useUpdateSpecialist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: MessagingSpecialistUpdate }) =>
      messagingService.updateSpecialist(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.specialists() })
    },
  })
}
```

> If `use-messaging.ts` imports the service as a namespace (`import * as messagingService`), the calls above work as written. If it imports named functions, add `getSpecialists` and `updateSpecialist` to that import list and call them directly. Check the existing import style at the top of the file and match it.

- [ ] **Step 5: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this task. (If the command reports errors, confirm they are not in the four files you touched — run `git stash && npx tsc --noEmit 2>&1 | wc -l` to compare the baseline error count on `main`, then `git stash pop`. Only errors in the changed files count as failures.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/services/messaging.ts src/lib/query-keys.ts src/hooks/use-messaging.ts
git commit -m "feat(ai): specialist + KB-tag types, service, query-key, and hooks"
```

---

## Task 7: Admin UI — Specialists editor + KB specialist-tags selector

**Files:**
- Modify: `src/pages/admin/messaging-settings.tsx`

- [ ] **Step 1: Add imports + a SpecialistEditor sub-component**

In `src/pages/admin/messaging-settings.tsx`:

1. Add to the hooks import block (near `useKnowledgeBase`): `useSpecialists`, `useUpdateSpecialist`.
2. Add to the types import (line 56): `MessagingSpecialist`.

Then add this sub-component just above `// ---------- Main Page ----------` (line ~425):

```tsx
// ---------- Specialist Editor ----------

function SpecialistEditor({ specialist }: { specialist: MessagingSpecialist }) {
  const [playbook, setPlaybook] = useState(specialist.playbook)
  const [alwaysEscalate, setAlwaysEscalate] = useState(specialist.always_escalate)
  const [isActive, setIsActive] = useState(specialist.is_active)
  const [dirty, setDirty] = useState(false)
  const updateSpecialist = useUpdateSpecialist()

  function handleSave() {
    updateSpecialist.mutate(
      { id: specialist.id, updates: { playbook, always_escalate: alwaysEscalate, is_active: isActive } },
      {
        onSuccess: () => { toast.success(`${specialist.name} playbook saved`); setDirty(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{specialist.name}</p>
          <p className="text-xs text-muted-foreground">Intents: {specialist.intents.join(', ')}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!dirty || updateSpecialist.isPending}>Save</Button>
      </div>
      <Textarea
        value={playbook}
        onChange={(e) => { setPlaybook(e.target.value); setDirty(true) }}
        className="min-h-[140px] text-sm font-mono"
        placeholder="Per-topic instructions the AI follows for this specialist..."
      />
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={alwaysEscalate} onCheckedChange={(v) => { setAlwaysEscalate(v); setDirty(true) }} />
          <Label className="text-sm">Always escalate to human</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={(v) => { setIsActive(v); setDirty(true) }} />
          <Label className="text-sm">Active</Label>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Render the Specialists section in the page**

Inside `MessagingSettingsPage`, add near the other data hooks (by `useKnowledgeBase`, line ~438):

```tsx
  const { data: specialists = [], isLoading: loadingSpecialists } = useSpecialists()
```

Then add a new Card in the JSX, placed right after the Persona Section card (the persona `</Card>` closes around line ~790; insert immediately after it):

```tsx
      {/* Specialists Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Specialist Playbooks</CardTitle>
          <CardDescription>
            Per-topic instructions the AI follows after it classifies a message. "Always escalate" forces human review for that topic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSpecialists ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            specialists.map((s) => <SpecialistEditor key={s.id} specialist={s} />)
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 3: Add a specialist-tags selector to the KB article dialog**

In `KbEntryFormDialog` (line ~307): pull the specialists list and tag state.

After the existing state declarations (line ~321, after `isActive`), add:

```tsx
  const [specialistTags, setSpecialistTags] = useState<string[]>(entry?.specialist_tags ?? [])
  const { data: specialists = [] } = useSpecialists()
```

In the edit-sync `if` block (lines ~327-332), add inside it:

```tsx
    setSpecialistTags(entry.specialist_tags ?? [])
```

In `handleSubmit`, include `specialist_tags` in BOTH the update and create payloads:
- update branch `updates: { title, content, category, is_active: isActive, specialist_tags: specialistTags }`
- create branch `{ entry_type: entryType, title, content, category, is_active: isActive, specialist_tags: specialistTags }`

Then, only for knowledge articles (not guardrails), render the selector — add this right after the Category `</div>` block (inside the `{!isGuardrail && (...)}` area, or as its own `{!isGuardrail && (...)}` block after it):

```tsx
          {!isGuardrail && (
            <div className="space-y-2">
              <Label>Specialists (leave empty for shared knowledge)</Label>
              <div className="flex flex-wrap gap-2">
                {specialists.map((s) => {
                  const on = specialistTags.includes(s.slug)
                  return (
                    <Button
                      key={s.slug}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      onClick={() =>
                        setSpecialistTags((prev) =>
                          on ? prev.filter((t) => t !== s.slug) : [...prev, s.slug],
                        )
                      }
                    >
                      {s.name}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this task (same baseline-comparison rule as Task 6 Step 5 if the repo has pre-existing errors).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/messaging-settings.tsx
git commit -m "feat(ai): admin UI for specialist playbooks + KB specialist tags"
```

---

## Task 8: Deploy + manual verification

**Files:**
- Modify: `package.json` (version bump)

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "1.46.1"` to `"version": "1.47.0"` (minor — new feature).

- [ ] **Step 2: Commit + merge to main**

```bash
git add package.json
git commit -m "chore: bump version to 1.47.0 (specialist playbooks)"
git checkout main
git merge --no-ff plan3b-specialist-playbooks -m "Merge plan3b-specialist-playbooks: per-topic specialist playbooks + KB tagging"
```

- [ ] **Step 3: Deploy the edge functions**

(The migration was already applied in Task 1 via `supabase db push`.)

Run: `supabase functions deploy generate-pending-drafts test-ai-reply`
Expected: both deploy successfully.

- [ ] **Step 4: Push main**

```bash
git push origin main
```

- [ ] **Step 5: Manual verification in the AI Test Playground**

In the app: Admin → Messaging Settings → AI Test Playground. Confirm:
- A product-inquiry message ("may laptop po kayo?") produces a Sales-style reply (asks qualifying questions / recommends stock).
- A complaint ("sira yung binili ko") returns a draft AND the response shows escalation (low confidence / escalation reason) — Aftersales `always_escalate`.
- A kaitori message ("gusto ko ibenta yung phone ko") does not quote a price and escalates.
- An order-status message references order/tracking context.

Also confirm the new **Specialist Playbooks** card lists 5 specialists and that editing + saving a playbook persists (reload the page).

- [ ] **Step 6: Done**

No further commits. Report verification results to Joey, including the Plan 3 live-Messenger smoke test still being his to run.

---

## Notes for the implementer

- **Migrations:** apply automatically via `supabase db push` / Supabase CLI — do not ask the user (project convention).
- **Untyped Supabase client:** `.insert/.update/.select` produce PRE-EXISTING `never`-type errors in edge functions. These are not regressions; do not attempt to "fix" them as part of this plan.
- **Branch:** all work is on `plan3b-specialist-playbooks` (already created off `main`). Only Task 8 touches `main`.
- **No new model call:** the design is deliberately single-call. Do not add a classifier call.
- **No new `technical` intent:** out of scope; technical questions fall under Sales/Generalist.
