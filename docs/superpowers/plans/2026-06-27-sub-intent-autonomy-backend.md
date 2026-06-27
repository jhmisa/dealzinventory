# Sub-Intent Autonomy Engine (Backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the messaging AI an editable Category→Sub-intent taxonomy where each sub-intent carries recognition cues, handling instructions, and a per-intent autonomy switch (OFF / DRAFT / SEND), enforced safely on every inbound draft.

**Architecture:** A new `messaging_sub_intents` table hangs off the existing `messaging_specialists` (the Category level). The draft pipeline gains a cheap **classify pass** (call 1) that picks the legacy intent + most-specific sub-intent; a pure **autonomy resolver** maps that to an effective OFF/DRAFT/SEND under five safety rails; then OFF stops, DRAFT keeps today's behavior, and SEND generates the reply (call 2) and transmits it through a newly-extracted shared Missive-send module (reused by both the staff-approve path and auto-send). **Routing has two axes:** topic (a physical folder, now resolvable from an optional `target_folder` on the sub-intent/category, falling back to today's hardcoded map) and status (the AI-non-actionable signal `needs_human_review`, which already drives a virtual "Action Required" queue and is auto-cleared by any human reply — no re-filing).

**Tech Stack:** Supabase Postgres + RLS migrations, Deno edge functions (TypeScript), `deno test` for the pure functions. No frontend in this plan (see Plan 2 for the admin UI + service layer).

**Scope:** Backend only. This plan ships working auto-send driven by **seeded** sub-intents (`promo_raffle`, `shipment_status`). Staff-editable CRUD UI is Plan 2.

**Out of scope:** Tier-3 action-taking sub-intents (review-link send, multi-turn state machines); any new Yamato integration; the admin UI and `src/services/messaging.ts` changes.

---

## File Map

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/20260627100000_sub_intent_autonomy.sql` | `messaging_sub_intents` table (incl. `target_folder`), `messaging_specialists.target_folder`, RLS/grants, `messages.auto_sent`, nullable `sent_by`, `auto_send_confidence_threshold` setting, seed rows | Create |
| `supabase/functions/_shared/sub-intents.ts` | Types + pure functions: `buildClassificationPrompt`, `matchSubIntent`, `resolveAutonomy` | Create |
| `supabase/functions/_shared/sub-intents.test.ts` | Deno tests for the three pure functions | Create |
| `supabase/functions/_shared/ai-providers.ts` | Add `parseClassification` + `classifyMessage`; `Classification` type | Modify |
| `supabase/functions/_shared/ai-providers.test.ts` | Tests for `parseClassification` | Modify |
| `supabase/functions/_shared/send-via-missive.ts` | Extracted Missive-send core (conversation lookup → attachments → Missive Drafts API → status/conversation updates → draft approval) | Create |
| `supabase/functions/send-message/index.ts` | Thin auth wrapper that calls `sendViaMissive` with `sentBy = user.id` | Modify |
| `supabase/functions/_shared/generate-draft.ts` | Orchestrate classify → resolve autonomy → OFF/DRAFT/SEND + auto-send | Modify |

**Decisions locked here (with rationale):**
- The classifier returns the **legacy `intent`** (free string) plus `sub_intent_slug`. Keeping `intent` means the existing `specialistForIntent()` lookup, folder routing (`folderNameForIntent`), and `conversations.ai_intent` all keep working unchanged. New categories simply own a new intent string in their specialist's `intents[]` (and route to no folder until a mapping is added — safe).
- The sub-intent's `handling_instructions` are **appended as a high-priority "Active sub-intent" addendum** to the full specialist prompt on the reply pass — not a wholesale prompt replacement — so persona, guardrails, and the `search_inventory` tool stay intact.
- The new classify path is **isolated** in `classifyMessage` rather than refactoring the four working reply provider functions. The minor fetch duplication is accepted v1 tech debt (DRY later) in exchange for zero risk to the proven reply path.
- **Topic routing** resolves `sub_intent.target_folder` → `specialist.target_folder` → `folderNameForIntent(intent)`. Seeded specialists keep `target_folder = NULL`, so existing routing (incl. the `return`→Aftersales / `complaint`→Concern split) is unchanged; the columns exist for new categories (Plan 2 UI) to claim a home. **The "Action Required" queue is a Plan 2 UI filter on `needs_human_review`** — this backend only guarantees the flag is set correctly in every AI-non-actionable path (and the existing send path already clears it on reply).

---

## Task 1: Migration — table, columns, setting, seed

**Files:**
- Create: `supabase/migrations/20260627100000_sub_intent_autonomy.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration via CLI** (project rule: always apply migrations automatically, never ask)

Run: `supabase db push`
Expected: `Applying migration 20260627100000_sub_intent_autonomy.sql...` then success, no errors.

- [ ] **Step 3: Verify the table, seed, and columns exist**

Run:
```bash
supabase db query "select si.slug, s.slug as specialist, si.autonomy from messaging_sub_intents si join messaging_specialists s on s.id = si.specialist_id order by si.slug;"
```
Expected: two rows — `promo_raffle | sales | DRAFT` and `shipment_status | order_tracking | DRAFT`.

Run:
```bash
supabase db query "select column_name, is_nullable from information_schema.columns where table_name='messages' and column_name in ('auto_sent','sent_by');"
```
Expected: `auto_sent | NO`, `sent_by | YES`.

- [ ] **Step 4: Regenerate TypeScript types** (project convention after schema changes)

Run: `supabase gen types typescript --local > src/lib/types.ts`
Expected: file updates; `messaging_sub_intents` and `messages.auto_sent` now present.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260627100000_sub_intent_autonomy.sql src/lib/types.ts
git commit -m "feat(messaging): sub_intent taxonomy table, auto_sent flag, autonomy seed"
```

---

## Task 2: Pure function — `resolveAutonomy` (the five safety rails)

**Files:**
- Create: `supabase/functions/_shared/sub-intents.ts`
- Test: `supabase/functions/_shared/sub-intents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/sub-intents.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { resolveAutonomy, type SubIntentRow } from "./sub-intents.ts";
import type { SpecialistRow } from "./build-specialist-prompt.ts";

const sales: SpecialistRow = {
  slug: "sales", name: "Sales", intents: ["product_inquiry"], playbook: "",
  always_escalate: false, is_active: true, sort_order: 0,
};
const aftersales: SpecialistRow = { ...sales, slug: "aftersales", always_escalate: true };

function sub(autonomy: SubIntentRow["autonomy"]): SubIntentRow {
  return {
    specialist_slug: "sales", slug: "x", name: "X",
    recognition_cues: "", handling_instructions: "", autonomy, is_active: true, sort_order: 0,
  };
}

Deno.test("no matched sub-intent (category default) -> DRAFT, never SEND", () => {
  assertEquals(resolveAutonomy({ subIntent: null, confidence: 0.99, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("OFF is absolute, regardless of confidence", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("OFF"), confidence: 0.2, specialist: sales, autoSendThreshold: 0.85 }), "OFF");
});

Deno.test("DRAFT request stays DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("DRAFT"), confidence: 0.99, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND above threshold on a normal specialist -> SEND", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.9, specialist: sales, autoSendThreshold: 0.85 }), "SEND");
});

Deno.test("SEND below threshold downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.8, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND under an always_escalate specialist downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.99, specialist: aftersales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND with no matched specialist downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.99, specialist: null, autoSendThreshold: 0.85 }), "DRAFT");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: FAIL — `Module not found "./sub-intents.ts"`.

- [ ] **Step 3: Create `sub-intents.ts` with types + `resolveAutonomy`**

```ts
import type { SpecialistRow } from "./build-specialist-prompt.ts";

export type Autonomy = "OFF" | "DRAFT" | "SEND";

export interface SubIntentRow {
  specialist_slug: string;
  slug: string;
  name: string;
  recognition_cues: string;
  handling_instructions: string;
  autonomy: Autonomy;
  target_folder?: string | null;   // optional topic-folder override; falls back to category/intent
  is_active: boolean;
  sort_order: number;
}

/**
 * Map a matched sub-intent to an effective autonomy, applying the safety rails:
 *  1. No matched sub-intent (category default / novel)  -> DRAFT  (never SEND)
 *  2. SEND below the confidence threshold               -> DRAFT
 *  3. SEND under an always_escalate specialist           -> DRAFT
 *  4. SEND with no resolvable specialist                 -> DRAFT
 * OFF is absolute; DRAFT stays DRAFT. (The global kill switch is enforced upstream.)
 */
export function resolveAutonomy(args: {
  subIntent: SubIntentRow | null;
  confidence: number;
  specialist: SpecialistRow | null;
  autoSendThreshold: number;
}): Autonomy {
  const { subIntent, confidence, specialist, autoSendThreshold } = args;
  if (!subIntent) return "DRAFT";              // rule 1
  if (subIntent.autonomy === "OFF") return "OFF";
  if (subIntent.autonomy === "DRAFT") return "DRAFT";
  // autonomy === "SEND" — apply downgrades
  if (!specialist || specialist.always_escalate) return "DRAFT"; // rules 3 & 4
  if (confidence < autoSendThreshold) return "DRAFT";            // rule 2
  return "SEND";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: PASS (7 tests ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/sub-intents.ts supabase/functions/_shared/sub-intents.test.ts
git commit -m "feat(messaging): resolveAutonomy with five autonomy safety rails"
```

---

## Task 3: Pure function — `matchSubIntent`

**Files:**
- Modify: `supabase/functions/_shared/sub-intents.ts`
- Test: `supabase/functions/_shared/sub-intents.test.ts`

- [ ] **Step 1: Add the failing test** (append to `sub-intents.test.ts`)

```ts
import { matchSubIntent } from "./sub-intents.ts";

const rows: SubIntentRow[] = [
  { specialist_slug: "sales", slug: "promo_raffle", name: "Promo", recognition_cues: "", handling_instructions: "no search", autonomy: "DRAFT", is_active: true, sort_order: 0 },
  { specialist_slug: "order_tracking", slug: "shipment_status", name: "Ship", recognition_cues: "", handling_instructions: "report", autonomy: "DRAFT", is_active: true, sort_order: 0 },
  { specialist_slug: "sales", slug: "inactive_one", name: "Old", recognition_cues: "", handling_instructions: "", autonomy: "SEND", is_active: false, sort_order: 0 },
];

Deno.test("matchSubIntent finds the row by specialist + slug", () => {
  const r = matchSubIntent("sales", "promo_raffle", rows);
  assertEquals(r?.handling_instructions, "no search");
});

Deno.test("matchSubIntent returns null when slug is null (category default)", () => {
  assertEquals(matchSubIntent("sales", null, rows), null);
});

Deno.test("matchSubIntent returns null when slug belongs to a different specialist", () => {
  assertEquals(matchSubIntent("sales", "shipment_status", rows), null);
});

Deno.test("matchSubIntent ignores inactive rows", () => {
  assertEquals(matchSubIntent("sales", "inactive_one", rows), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: FAIL — `matchSubIntent is not a function` / not exported.

- [ ] **Step 3: Implement `matchSubIntent`** (append to `sub-intents.ts`)

```ts
/**
 * Resolve a classified (specialistSlug, subIntentSlug) to its active SubIntentRow.
 * Returns null for a null slug (category default) or any non-active / cross-specialist slug.
 */
export function matchSubIntent(
  specialistSlug: string | null,
  subIntentSlug: string | null,
  subIntents: SubIntentRow[],
): SubIntentRow | null {
  if (!specialistSlug || !subIntentSlug) return null;
  return (
    subIntents.find(
      (si) => si.is_active && si.specialist_slug === specialistSlug && si.slug === subIntentSlug,
    ) ?? null
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: PASS (11 tests ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/sub-intents.ts supabase/functions/_shared/sub-intents.test.ts
git commit -m "feat(messaging): matchSubIntent resolver"
```

---

## Task 4: Pure function — `buildClassificationPrompt`

**Files:**
- Modify: `supabase/functions/_shared/sub-intents.ts`
- Test: `supabase/functions/_shared/sub-intents.test.ts`

- [ ] **Step 1: Add the failing test** (append)

```ts
import { buildClassificationPrompt } from "./sub-intents.ts";

Deno.test("buildClassificationPrompt lists specialists, their intents, and sub-intent cues", () => {
  const prompt = buildClassificationPrompt({ specialists: [sales], subIntents: rows });
  // Mentions the specialist + its legacy intent (valid intents the model may emit)
  if (!prompt.includes("Sales")) throw new Error("missing specialist name");
  if (!prompt.includes("product_inquiry")) throw new Error("missing legacy intent");
  // Lists the sub-intent slug + its recognition cues so the model can pick it
  if (!prompt.includes("promo_raffle")) throw new Error("missing sub-intent slug");
  // Asks for the structured classification fields
  if (!prompt.includes("sub_intent_slug")) throw new Error("missing output schema");
  if (!prompt.includes("confidence")) throw new Error("missing confidence field");
});

Deno.test("buildClassificationPrompt only includes the active specialist's own sub-intents", () => {
  const prompt = buildClassificationPrompt({ specialists: [sales], subIntents: rows });
  // shipment_status belongs to order_tracking (not passed) -> must not appear
  if (prompt.includes("shipment_status")) throw new Error("leaked another specialist's sub-intent");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: FAIL — `buildClassificationPrompt is not a function`.

- [ ] **Step 3: Implement `buildClassificationPrompt`** (append to `sub-intents.ts`)

```ts
import type { SpecialistRow } from "./build-specialist-prompt.ts";

/**
 * Build the system prompt for the cheap CLASSIFY pass. Enumerates each active specialist
 * (Category), its legacy intents (the valid `intent` values the model may emit), and its
 * active sub-intents with recognition cues, then asks for a compact JSON classification.
 */
export function buildClassificationPrompt(args: {
  specialists: SpecialistRow[];
  subIntents: SubIntentRow[];
}): string {
  const active = args.specialists
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  let prompt =
    "You are a message classifier for a Filipino-facing resale shop's customer chat. " +
    "Read the latest customer message (and any screenshot) in the context below and classify it.\n\n" +
    "# Categories, intents, and sub-intents\n";

  for (const s of active) {
    prompt += `\n## ${s.name} — intents: ${s.intents.join(", ")}\n`;
    const subs = args.subIntents
      .filter((si) => si.is_active && si.specialist_slug === s.slug)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (subs.length === 0) {
      prompt += "(no specific sub-intents — use sub_intent_slug = null)\n";
      continue;
    }
    for (const si of subs) {
      prompt += `- sub_intent_slug "${si.slug}" (${si.name}): ${si.recognition_cues}\n`;
    }
  }

  prompt +=
    "\n# Output\nRespond ONLY with a JSON object, no markdown fences:\n" +
    '- "intent": the single best legacy intent from the lists above (e.g. "product_inquiry"); ' +
    'use "unknown" if nothing fits.\n' +
    '- "sub_intent_slug": the most specific matching sub_intent_slug from the chosen category, ' +
    "or null if the message fits the category generally but no specific sub-intent.\n" +
    '- "confidence": 0.0-1.0, how sure you are of this classification.\n' +
    "Pick a sub_intent_slug ONLY when the message clearly matches its cues; otherwise use null.";

  return prompt;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: PASS (13 tests ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/sub-intents.ts supabase/functions/_shared/sub-intents.test.ts
git commit -m "feat(messaging): buildClassificationPrompt for the classify pass"
```

---

## Task 5: Pure function — `parseClassification`

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Add the failing test** (append to `ai-providers.test.ts`)

```ts
import { parseClassification } from "./ai-providers.ts";
import { assertEquals } from "jsr:@std/assert";

Deno.test("parseClassification reads a clean JSON object", () => {
  const c = parseClassification('{"intent":"product_inquiry","sub_intent_slug":"promo_raffle","confidence":0.9}');
  assertEquals(c, { intent: "product_inquiry", sub_intent_slug: "promo_raffle", confidence: 0.9 });
});

Deno.test("parseClassification strips markdown fences", () => {
  const c = parseClassification('```json\n{"intent":"tracking","sub_intent_slug":null,"confidence":0.7}\n```');
  assertEquals(c, { intent: "tracking", sub_intent_slug: null, confidence: 0.7 });
});

Deno.test("parseClassification clamps confidence and defaults missing fields", () => {
  const c = parseClassification('{"confidence":5}');
  assertEquals(c, { intent: "unknown", sub_intent_slug: null, confidence: 1 });
});

Deno.test("parseClassification falls back safely on garbage", () => {
  const c = parseClassification("not json at all");
  assertEquals(c, { intent: "unknown", sub_intent_slug: null, confidence: 0 });
});

Deno.test("parseClassification coerces empty-string sub_intent_slug to null", () => {
  const c = parseClassification('{"intent":"general","sub_intent_slug":"","confidence":0.5}');
  assertEquals(c.sub_intent_slug, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `parseClassification is not a function`.

- [ ] **Step 3: Add the `Classification` type and `parseClassification`** to `ai-providers.ts` (place after the `AIResponse` interface, around line 29)

```ts
export interface Classification {
  intent: string;
  sub_intent_slug: string | null;
  confidence: number;
}

// Parse the CLASSIFY pass output. Mirrors parseAIResponse's tolerant strategies but for the
// compact {intent, sub_intent_slug, confidence} shape. On total failure returns a zero-confidence
// "unknown" so the autonomy resolver downgrades to DRAFT (never auto-sends an unparseable message).
export function parseClassification(text: string): Classification {
  const strategies = [
    () => JSON.parse(text.trim()),
    () => JSON.parse(text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()),
    () => {
      const m = text.match(/\{[\s\S]*"confidence"[\s\S]*\}/);
      if (!m) throw new Error("no json");
      return JSON.parse(m[0]);
    },
  ];
  for (const strat of strategies) {
    try {
      const p = strat();
      if (p && typeof p === "object") {
        const rawSlug = p.sub_intent_slug;
        const slug = typeof rawSlug === "string" && rawSlug.length > 0 ? rawSlug : null;
        return {
          intent: typeof p.intent === "string" && p.intent.length > 0 ? p.intent : "unknown",
          sub_intent_slug: slug,
          confidence: Math.min(1, Math.max(0, Number(p.confidence ?? 0))),
        };
      }
    } catch {
      // try next strategy
    }
  }
  return { intent: "unknown", sub_intent_slug: null, confidence: 0 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (existing tests + 5 new ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(messaging): parseClassification for the classify pass"
```

---

## Task 6: `classifyMessage` — the cheap classify provider call

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`

This is an integration function (live provider call). It is isolated from the four working reply functions. Verification is by deploy + Playground (Task 9), consistent with the repo's edge-function testing pattern — no live-API unit test.

- [ ] **Step 1: Add `classifyMessage`** to `ai-providers.ts` (append near the bottom, after `parseAIResponse`)

```ts
import { type VisionImage, toOpenAIContent, toAnthropicContent, toGeminiParts, modelSupportsVision } from "./ai-vision.ts";

// Run the cheap CLASSIFY pass. No tools, small output. Returns the parsed classification + usage.
// Reuses each provider's chat endpoint with the classification system prompt. Images are forwarded
// to vision-capable models so screenshot-driven cues (e.g. a raffle promo) classify correctly.
export async function classifyMessage(
  provider: AIProvider,
  classificationPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  latestImages: VisionImage[] = [],
): Promise<{ classification: Classification; usage: TokenUsage }> {
  const images = modelSupportsVision(provider.provider, provider.model_id) ? latestImages : [];
  const system = `${classificationPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}`;
  const convo = consolidateMessages(messages);

  // Anthropic uses a separate system field; the OpenAI-compatible providers use a system message.
  if (provider.provider === "anthropic") {
    const anthropicMessages = convo.map((m) => ({
      role: m.role === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.content as string | unknown[],
    }));
    if (images.length > 0) {
      for (let i = anthropicMessages.length - 1; i >= 0; i--) {
        if (anthropicMessages[i].role === "user") {
          anthropicMessages[i].content = toAnthropicContent(anthropicMessages[i].content as string, images);
          break;
        }
      }
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": provider.api_key_encrypted, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: provider.model_id, max_tokens: 256, system, messages: anthropicMessages }),
    });
    if (!res.ok) throw new Error(`Classify (anthropic) error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { classification: parseClassification(data.content?.[0]?.text ?? ""), usage: extractUsage("anthropic", data) };
  }

  if (provider.provider === "google") {
    const lastUserIdx = (() => { for (let i = convo.length - 1; i >= 0; i--) if (convo[i].role === "customer") return i; return -1; })();
    const contents = convo.map((m, idx) => ({
      role: m.role === "customer" ? "user" : "model",
      parts: images.length > 0 && idx === lastUserIdx ? toGeminiParts(m.content, images) : [{ text: m.content }],
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model_id}:generateContent?key=${provider.api_key_encrypted}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 256, responseMimeType: "application/json" } }),
    });
    if (!res.ok) throw new Error(`Classify (google) error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { classification: parseClassification(data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""), usage: extractUsage("google", data) };
  }

  // openai + openrouter — OpenAI-compatible chat completions with a system message.
  const url = provider.provider === "openai"
    ? "https://api.openai.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const oaMessages: Array<{ role: string; content: string | unknown[] }> = [
    { role: "system", content: system },
    ...convo.map((m) => ({ role: m.role === "customer" ? ("user" as const) : ("assistant" as const), content: m.content as string | unknown[] })),
  ];
  if (images.length > 0) {
    for (let i = oaMessages.length - 1; i >= 0; i--) {
      if (oaMessages[i].role === "user") { oaMessages[i].content = toOpenAIContent(oaMessages[i].content as string, images); break; }
    }
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key_encrypted}` },
    body: JSON.stringify({ model: provider.model_id, max_tokens: 256, messages: oaMessages, response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(`Classify (${provider.provider}) error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { classification: parseClassification(data.choices?.[0]?.message?.content ?? ""), usage: extractUsage(provider.provider, data) };
}
```

> Note: `consolidateMessages`, `extractUsage`, `ChatMessage`, `AIProvider`, `TokenUsage` already exist in this file / its imports. If `VisionImage` / the `to*Content` helpers are already imported at the top of `ai-providers.ts`, do NOT duplicate the import line — fold the names into the existing import from `./ai-vision.ts`.

- [ ] **Step 2: Type-check the function compiles**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts
git commit -m "feat(messaging): classifyMessage cheap classify pass (all providers)"
```

---

## Task 7: Extract `sendViaMissive` shared module

**Files:**
- Create: `supabase/functions/_shared/send-via-missive.ts`
- Modify: `supabase/functions/send-message/index.ts`

Move the Missive-send core out of the auth-gated handler so the cron/service-role auto-send path can reuse it. The handler keeps auth + request parsing; `sendViaMissive` does the work.

- [ ] **Step 1: Create `send-via-missive.ts`** (lift the logic from `send-message/index.ts:104-352`; `sentBy` is now a parameter, nullable for system auto-send)

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const MISSIVE_API_URL = "https://public.missiveapp.com/v1";

export interface MessageAttachment {
  file_url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

export interface SendViaMissiveOpts {
  conversationId: string;
  content: string;
  attachments?: MessageAttachment[];
  approveDraftId?: string;   // when set, this draft row BECOMES the sent message
  sentBy?: string | null;    // staff user id, or null for system auto-send
  autoSent?: boolean;        // stamp messages.auto_sent on the sent row
}

export interface SendViaMissiveResult {
  ok: boolean;
  error?: string;
  messageId?: string;
  missiveMessageId?: string | null;
}

/**
 * Transmit a message to the customer via Missive and reconcile DB status.
 * Extracted from send-message so both the staff-approve handler (with a user id) and the
 * cron auto-send path (service role, no user) share one battle-tested implementation.
 */
export async function sendViaMissive(
  supabase: ReturnType<typeof createClient>,
  opts: SendViaMissiveOpts,
): Promise<SendViaMissiveResult> {
  const MISSIVE_API_TOKEN = Deno.env.get("MISSIVE_API_TOKEN") ?? "";
  const MISSIVE_MESSENGER_ACCOUNT_ID = Deno.env.get("MISSIVE_MESSENGER_ACCOUNT_ID") ?? "";
  const { conversationId, content, attachments: inputAttachments, approveDraftId, sentBy = null, autoSent = false } = opts;

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, missive_conversation_id, contact_platform_id")
    .eq("id", conversationId)
    .single();
  if (convError || !conversation) {
    return { ok: false, error: `Conversation not found: ${convError?.message ?? "unknown"}` };
  }

  if (approveDraftId) {
    await supabase.from("messages").update({ status: "SENDING" }).eq("id", approveDraftId);
  }

  // Insert the outbound row (the "send carrier"). For an approved draft, this row is deleted on
  // success and the draft itself is marked SENT (mirrors the original handler's behavior).
  const { data: msg, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "staff" as const,
      content,
      status: "SENDING" as const,
      message_type: "REPLY" as const,
      sent_by: sentBy,
      auto_sent: autoSent,
      attachments: inputAttachments ?? [],
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: `Failed to insert message: ${insertError.message}` };

  // --- attachment guards (unchanged from the original handler) ---
  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
  const BASE64_OVERHEAD = 4 / 3;
  const MAX_PAYLOAD_BYTES = 9 * 1024 * 1024;
  if (inputAttachments && inputAttachments.length > 0) {
    for (const att of inputAttachments) {
      if (att.size_bytes && att.size_bytes > MAX_ATTACHMENT_BYTES) {
        await supabase.from("messages").update({
          status: "FAILED",
          error_details: { reason: "attachment_too_large", filename: att.filename, size_bytes: att.size_bytes, max_bytes: MAX_ATTACHMENT_BYTES },
        }).eq("id", msg.id);
        return { ok: false, error: `Attachment "${att.filename}" is too large.`, messageId: msg.id };
      }
    }
    const estimatedPayload = inputAttachments.reduce((s, a) => s + (a.size_bytes ?? 0) * BASE64_OVERHEAD, 0) + (content?.length ?? 0);
    if (estimatedPayload > MAX_PAYLOAD_BYTES) {
      await supabase.from("messages").update({
        status: "FAILED",
        error_details: { reason: "payload_too_large", estimated_payload_bytes: Math.round(estimatedPayload), max_bytes: MAX_PAYLOAD_BYTES },
      }).eq("id", msg.id);
      return { ok: false, error: "Message attachments total too large.", messageId: msg.id };
    }
  }

  // --- download attachments -> base64 (unchanged) ---
  const missiveAttachments: Array<{ base64_data: string; filename: string }> = [];
  if (inputAttachments && inputAttachments.length > 0) {
    for (const att of inputAttachments) {
      try {
        const { data: fileData, error: dErr } = await supabase.storage.from("messaging-attachments").download(att.file_url);
        if (dErr || !fileData) continue;
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        missiveAttachments.push({ base64_data: btoa(binary), filename: att.filename });
      } catch { /* skip a bad attachment, non-fatal */ }
    }
  }

  // --- Missive send (unchanged, with 20s timeout) ---
  let missiveMessageId: string | null = null;
  let sendError: { missive_status?: number; missive_error?: string; attempted_at: string; retry_count: number } | null = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    if (!MISSIVE_API_TOKEN) throw new Error("MISSIVE_API_TOKEN not configured");
    if (!conversation.contact_platform_id) throw new Error("No contact_platform_id on conversation");
    const draftPayload: Record<string, unknown> = {
      send: true,
      account: MISSIVE_MESSENGER_ACCOUNT_ID,
      body: content,
      to_fields: [{ id: conversation.contact_platform_id }],
      conversation: conversation.missive_conversation_id,
      ...(missiveAttachments.length > 0 && { attachments: missiveAttachments }),
    };
    const missiveRes = await fetch(`${MISSIVE_API_URL}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
      body: JSON.stringify({ drafts: draftPayload }),
      signal: controller.signal,
    });
    if (!missiveRes.ok) {
      sendError = { missive_status: missiveRes.status, missive_error: await missiveRes.text(), attempted_at: new Date().toISOString(), retry_count: 0 };
    } else {
      missiveMessageId = (await missiveRes.json())?.drafts?.id ?? null;
    }
  } catch (fetchErr) {
    const isTimeout = fetchErr instanceof Error && fetchErr.name === "AbortError";
    sendError = { missive_error: isTimeout ? "Missive API timeout after 20s" : (fetchErr instanceof Error ? fetchErr.message : "Network error"), attempted_at: new Date().toISOString(), retry_count: 0 };
  } finally {
    clearTimeout(timeoutId);
  }

  // --- reconcile status (unchanged) ---
  await supabase.from("messages").update({
    status: sendError ? "FAILED" : "SENT",
    ...(missiveMessageId && { missive_message_id: missiveMessageId }),
    ...(sendError && { error_details: sendError }),
  }).eq("id", msg.id);

  if (approveDraftId) {
    await supabase.from("messages").update({ status: sendError ? "FAILED" : "SENT" }).eq("id", approveDraftId);
    if (!sendError) await supabase.from("messages").delete().eq("id", msg.id);
  }

  if (!sendError) {
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      needs_human_review: false,
      draft_pending_since: null,
    }).eq("id", conversation.id);
  }

  if (sendError) return { ok: false, error: `Message delivery failed: ${sendError.missive_error ?? "Unknown error"}`, messageId: msg.id };
  return { ok: true, messageId: approveDraftId ?? msg.id, missiveMessageId };
}
```

- [ ] **Step 2: Refactor `send-message/index.ts` to call `sendViaMissive`** — replace lines 104-367 (everything from destructuring the body through the final success `jsonResponse`) with:

```ts
    const { conversation_id, content, approve_draft_id, attachments: inputAttachments } = body as unknown as {
      conversation_id: string; content: string; approve_draft_id?: string; attachments?: MessageAttachment[];
    };
    if (!conversation_id || !content) {
      return jsonResponse({ error: "conversation_id and content are required" });
    }

    const result = await sendViaMissive(supabase, {
      conversationId: conversation_id,
      content,
      attachments: inputAttachments,
      approveDraftId: approve_draft_id,
      sentBy: user.id,
      autoSent: false,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error, message_id: result.messageId });
    }
    return jsonResponse({ ok: true, message_id: result.messageId, missive_message_id: result.missiveMessageId });
```

Add the import at the top of `send-message/index.ts` (after the existing imports):

```ts
import { sendViaMissive, type MessageAttachment } from "../_shared/send-via-missive.ts";
```

Then delete the now-unused local `MessageAttachment` interface (lines 15-20) and the `MISSIVE_API_URL` / messenger consts that moved into the shared module — but KEEP `MISSIVE_API_TOKEN` if the health-check block above still references it. (The health check at lines 49-65 stays in the handler.)

- [ ] **Step 3: Type-check both files**

Run: `deno check supabase/functions/send-message/index.ts supabase/functions/_shared/send-via-missive.ts`
Expected: no errors.

- [ ] **Step 4: Deploy and smoke-test the staff send path still works** (no behavior change expected)

Run: `supabase functions deploy send-message`
Then, in the app, approve an AI draft for a test conversation and confirm the customer receives it and the draft flips to SENT (exactly as before this refactor).
Expected: send works identically; this is a pure extraction.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/send-via-missive.ts supabase/functions/send-message/index.ts
git commit -m "refactor(messaging): extract sendViaMissive shared module from send-message"
```

---

## Task 8: Wire the engine into `generate-draft.ts` (classify → resolve → OFF/DRAFT/SEND)

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Add imports** at the top of `generate-draft.ts` (extend existing imports)

```ts
import { generateAIReply, classifyMessage, type AIProvider } from "./ai-providers.ts";
import {
  buildClassificationPrompt,
  matchSubIntent,
  resolveAutonomy,
  type SubIntentRow,
} from "./sub-intents.ts";
import { sendViaMissive } from "./send-via-missive.ts";
```

(Replace the existing `import { generateAIReply, type AIProvider } from "./ai-providers.ts";` line with the one above.)

- [ ] **Step 2: Fetch active sub-intents + the auto-send threshold** — insert after the specialists fetch (`generate-draft.ts:102`, right after `const specialists = (specialistRows ?? []) as SpecialistRow[];`)

```ts
  // 2d. Fetch active sub-intents (joined to their specialist's slug) + the auto-send threshold.
  const { data: subIntentRows } = await supabase
    .from("messaging_sub_intents")
    .select("slug, name, recognition_cues, handling_instructions, autonomy, target_folder, is_active, sort_order, messaging_specialists!inner(slug)")
    .eq("is_active", true)
    .order("sort_order");
  const subIntents: SubIntentRow[] = ((subIntentRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    specialist_slug: (r.messaging_specialists as { slug: string }).slug,
    slug: String(r.slug),
    name: String(r.name),
    recognition_cues: String(r.recognition_cues ?? ""),
    handling_instructions: String(r.handling_instructions ?? ""),
    autonomy: r.autonomy as SubIntentRow["autonomy"],
    target_folder: (r.target_folder as string | null) ?? null,
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order ?? 0),
  }));

  const { data: thrRow } = await supabase
    .from("system_settings").select("value").eq("key", "auto_send_confidence_threshold").maybeSingle();
  const autoSendThreshold = Number((thrRow as { value?: string } | null)?.value ?? "0.85");
```

Also extend the **existing** specialist fetch (`generate-draft.ts:99`) so the matched specialist carries its folder. Change its `.select(...)` to include `target_folder`:

```ts
  const { data: specialistRows } = await supabase
    .from('messaging_specialists')
    .select('slug, name, intents, playbook, always_escalate, target_folder, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');
```

And add the optional field to `SpecialistRow` in `supabase/functions/_shared/build-specialist-prompt.ts` (after `sort_order`):

```ts
  sort_order: number;
  target_folder?: string | null; // optional topic-folder home for routing (see generate-draft routeAndFlag)
```

- [ ] **Step 3: Run the CLASSIFY pass and resolve autonomy** — insert immediately after the images are prepared (`generate-draft.ts:131`, after the `latestImages` assignment) and BEFORE the existing "5. Generate AI reply" block:

```ts
  // 4c. CLASSIFY pass (cheap, no tools). Determines intent + sub-intent + confidence, which in turn
  // decides autonomy. Doing this first means an OFF sub-intent never pays for reply generation.
  const classifyPrompt = buildClassificationPrompt({ specialists, subIntents });
  let classification;
  try {
    const res = await classifyMessage(provider as AIProvider, classifyPrompt, contextBlock, chatMessages, latestImages);
    classification = res.classification;
    // Best-effort usage log for the classify call.
    try {
      await supabase.from("ai_usage_log").insert({
        conversation_id: conversationId, purpose: "messaging_classify",
        provider: (provider as AIProvider).provider, model_id: (provider as AIProvider).model_id,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
        estimated_cost_usd: estimateCostUsd((provider as AIProvider).model_id, res.usage),
        had_images: latestImages.length > 0,
      });
    } catch (e) { console.error("classify usage log failed (non-fatal):", e); }
  } catch (err) {
    // Classify failed — fail safe to a low-confidence unknown so autonomy resolves to DRAFT.
    console.error("classify pass failed (non-fatal, defaulting to DRAFT):", err);
    classification = { intent: "unknown", sub_intent_slug: null, confidence: 0 };
  }

  const classifiedSpecialist = specialistForIntent(classification.intent, specialists);
  const matchedSubIntent = matchSubIntent(
    classifiedSpecialist?.slug ?? null, classification.sub_intent_slug, subIntents,
  );
  const autonomy = resolveAutonomy({
    subIntent: matchedSubIntent, confidence: classification.confidence,
    specialist: classifiedSpecialist, autoSendThreshold,
  });

  // 4c-bis. Resolve the topic folder: sub-intent override -> category home -> legacy intent map.
  const targetFolderName =
    matchedSubIntent?.target_folder ??
    classifiedSpecialist?.target_folder ??
    folderNameForIntent(classification.intent);

  // 4d. OFF — do not draft. Route to the topic folder + flag for a human (it surfaces in the
  // Action Required queue, which is just the needs_human_review filter), then stop.
  if (autonomy === "OFF") {
    await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, true);
    return;
  }
```

- [ ] **Step 4: Inject the matched sub-intent handling into the reply prompt** — modify the reply prompt assembly. Replace the existing `const aiResponse = await generateAIReply(...)` call's `fullSystemPrompt` argument by first building an augmented prompt. Insert just before the `const aiResponse = await generateAIReply(` line (`generate-draft.ts:156`):

```ts
  // Append the matched sub-intent's handling as a high-priority addendum so the reply follows it
  // (e.g. promo_raffle: "do NOT search inventory"). Falls back to the base prompt for category-default.
  const replySystemPrompt = matchedSubIntent
    ? `${fullSystemPrompt}\n\n# Active sub-intent: ${matchedSubIntent.name} (HIGHEST PRIORITY)\n${matchedSubIntent.handling_instructions}`
    : fullSystemPrompt;
```

Then change the `generateAIReply` call to pass `replySystemPrompt` instead of `fullSystemPrompt`:

```ts
  const aiResponse = await generateAIReply(
    provider as AIProvider,
    replySystemPrompt,
    contextBlock,
    chatMessages,
    latestImages,
    executeTool,
  );
```

- [ ] **Step 5: Replace the review-decision + save + routing tail.** Replace the block from `generate-draft.ts:182` (`// 6. Determine if human review is needed.`) through the end of the function (line 268) with the autonomy-aware version below. This reuses the matched specialist from Step 3 and adds the SEND path:

```ts
  // 6. Human-review flag for DRAFT/SEND. The classify pass already escalates novel/low-confidence
  // cases to DRAFT; here we decide whether that DRAFT also needs a human's eye.
  const needsReview =
    classification.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    classifiedSpecialist === null ||
    classifiedSpecialist.always_escalate === true;

  // 7. Assemble the final reply (offer codes + emoji block), unchanged.
  const offerCodes = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog);
  const offerAttachments = offerCodes.length
    ? await buildOfferAttachments(supabase, conversationId, offerCodes, offerCatalog)
    : [];
  const finalReply = assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog);

  // 7b. Insert the assistant message as a DRAFT (the canonical content row). For SEND we transmit
  // it below and stamp auto_sent; for DRAFT it simply waits for staff approval (today's behavior).
  const { data: inserted } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: finalReply,
    status: "DRAFT",
    message_type: "REPLY",
    ai_confidence: aiResponse.confidence,
    attachments: offerAttachments,
    ai_context_summary: JSON.stringify({
      intent: classification.intent,
      sub_intent_slug: classification.sub_intent_slug,
      autonomy,
      classify_confidence: classification.confidence,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
      offer_codes: offerCodes,
    }),
  }).select("id").single();

  // 7c. SEND — transmit immediately via the shared Missive sender (auto-approve this draft).
  if (autonomy === "SEND" && inserted?.id) {
    const sendResult = await sendViaMissive(supabase, {
      conversationId,
      content: finalReply,
      attachments: offerAttachments,
      approveDraftId: inserted.id,
      sentBy: null,        // system actor
      autoSent: true,
    });
    if (!sendResult.ok) {
      // Delivery failed — leave it as a draft for a human and flag it. sendViaMissive already
      // marked the draft FAILED; surface it for review rather than silently dropping.
      console.error("auto-send failed, leaving as draft for human:", sendResult.error);
      await supabase.from("messages").update({ status: "DRAFT" }).eq("id", inserted.id);
      await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, true);
      return;
    }
    // On success sendViaMissive already cleared needs_human_review + draft_pending_since and
    // routed nothing; still apply topic-folder routing for consistency.
    await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, false);
    return;
  }

  // 8. DRAFT — route to the topic folder + set review flag (today's behavior).
  await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, needsReview || !customerId);
}

/**
 * Persist ai_intent + needs_human_review and, best-effort, move the conversation into its resolved
 * topic folder (triage-out-of-inbox-only). The caller resolves targetFolderName from the taxonomy
 * (sub-intent override -> category home -> legacy intent map). Extracted so the OFF, SEND, and DRAFT
 * branches share one routing implementation. `needs_human_review` is the Action Required signal.
 */
async function routeAndFlag(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  customerId: string | null,
  intent: string,
  targetFolderName: string | null,
  needsHumanReview: boolean,
): Promise<void> {
  const conversationUpdate: Record<string, unknown> = {
    needs_human_review: needsHumanReview,
    ai_intent: intent,
  };
  if (targetFolderName) {
    try {
      const { data: folders, error: foldersErr } = await supabase
        .from("message_folders").select("id, name").in("name", ["Inbox", targetFolderName]);
      if (foldersErr) console.error("Intent routing: folder lookup failed (non-fatal):", foldersErr);
      const folderRows = (folders ?? []) as Array<{ id: string; name: string }>;
      const inboxId = folderRows.find((f) => f.name === "Inbox")?.id ?? null;
      const targetId = folderRows.find((f) => f.name === targetFolderName)?.id ?? null;
      const { data: convo, error: convoErr } = await supabase
        .from("conversations").select("folder_id").eq("id", conversationId).maybeSingle();
      if (convoErr) console.error("Intent routing: current-folder lookup failed (non-fatal):", convoErr);
      const currentFolderId = (convo as { folder_id: string | null } | null)?.folder_id ?? null;
      if (!convoErr && shouldRouteOutOfInbox(currentFolderId, inboxId, targetId)) {
        conversationUpdate.folder_id = targetId;
      }
    } catch (routeErr) {
      console.error("Intent routing failed (non-fatal):", routeErr);
    }
  }
  await supabase.from("conversations").update(conversationUpdate).eq("id", conversationId);
}
```

> Note: this removes the now-unused `specialistForIntent` call at the old line 186 (it's computed once in Step 3 as `classifiedSpecialist`). Keep the `specialistForIntent` import. The old inline routing block (lines 223-267) is fully replaced by `routeAndFlag`.

- [ ] **Step 6: Type-check**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 7: Deploy both affected functions**

Run: `supabase functions deploy generate-pending-drafts && supabase functions deploy missive-webhook`
(Both import `generate-draft.ts` via the shared module, so both must be redeployed.)
Expected: both deploy successfully.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(messaging): classify->autonomy pipeline with OFF/DRAFT/SEND in generate-draft"
```

---

## Task 9: End-to-end verification (seeded sub-intents)

**Files:** none (verification only). Use the Test Playground (`messaging-settings.tsx`) and/or a real test conversation.

- [ ] **Step 1: Verify the raffle disambiguation (promo_raffle, DRAFT)**

Send a test inbound message referencing a raffle/promo ("Saw your live — the watch raffle for ¥4,900, is this still available?") with a screenshot if possible.
Expected: a DRAFT is created whose `ai_context_summary.sub_intent_slug = "promo_raffle"`; the reply explains the raffle / hands off and does **NOT** assert "yes, it's available" from inventory. Confirm via:
```bash
supabase db query "select ai_context_summary->>'sub_intent_slug' as sub, status, auto_sent from messages where conversation_id = '<TEST_CONVO_ID>' order by created_at desc limit 1;"
```

- [ ] **Step 2: Verify shipment_status reads real context (DRAFT)**

For a test customer with a SHIPPED order that has a `tracking_number`, send "na-ship na po ba order ko?".
Expected: DRAFT with `sub_intent_slug = "shipment_status"` reporting the actual tracking number / status from context, inventing nothing.

- [ ] **Step 3: Verify SEND end-to-end**

Temporarily flip the seeded `shipment_status` sub-intent to SEND and set a low threshold so it fires:
```bash
supabase db query "update messaging_sub_intents set autonomy='SEND' where slug='shipment_status'; update system_settings set value='0.3' where key='auto_send_confidence_threshold';"
```
Send the shipment question again from a test conversation.
Expected: the customer receives the reply with **no human approval**; the message row has `auto_sent = true`, `status = 'SENT'`, and the conversation's `needs_human_review = false`. Verify:
```bash
supabase db query "select status, auto_sent, sent_by from messages where conversation_id='<TEST_CONVO_ID>' and role in ('assistant','staff') order by created_at desc limit 2;"
```
Then **restore** the seed: `update messaging_sub_intents set autonomy='DRAFT' where slug='shipment_status'; update system_settings set value='0.85' where key='auto_send_confidence_threshold';`

- [ ] **Step 4: Verify OFF suppresses the draft**

Temporarily set `promo_raffle` to OFF (`update messaging_sub_intents set autonomy='OFF' where slug='promo_raffle';`), resend the raffle message.
Expected: **no** assistant DRAFT row is created; the conversation has `needs_human_review = true` and `ai_intent = 'product_inquiry'`. Restore to DRAFT afterward.

- [ ] **Step 5: Confirm the global kill switch still wins**

With `ai_messaging_enabled = 'false'`, send any message.
Expected: no classification, no draft, no send (the cron gate short-circuits before `generateAndSaveDraft`).

- [ ] **Step 6: Verify topic routing + the Action Required signal**

Confirm a complaint-type message still lands in its topic folder unchanged (seeded specialists have `target_folder = NULL` → fall back to the legacy map):
```bash
supabase db query "select c.ai_intent, f.name as folder, c.needs_human_review from conversations c left join message_folders f on f.id = c.folder_id where c.id = '<TEST_CONVO_ID>';"
```
Expected for an escalating/OFF case: the conversation sits in its topic folder AND `needs_human_review = true` (this is what the Plan 2 "Action Required" view filters on). Then, optionally, set a custom folder on a category to prove the override:
```bash
supabase db query "update messaging_specialists set target_folder='Order' where slug='order_tracking';"
```
Resend a tracking question and confirm the thread routes to **Order**. (Restore to NULL afterward if you don't want the override.)

- [ ] **Step 7: Verify the Action Required flag auto-clears on reply**

For a conversation currently flagged `needs_human_review = true`, send a staff reply (approve a draft, or post a manual message).
Expected: `needs_human_review` flips to `false` (so the thread leaves the Action Required view) while `folder_id` is unchanged — i.e. it stays in its topic folder, no re-filing. Verify:
```bash
supabase db query "select needs_human_review, folder_id from conversations where id='<TEST_CONVO_ID>';"
```

- [ ] **Step 8: Bump version + final commit** (project rule: one version bump per session)

Edit `package.json` to bump the minor version, then:
```bash
git add package.json
git commit -m "chore: bump version — sub-intent autonomy engine (backend)"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** Data model incl. `target_folder` (Task 1) ✓; classification picks most-specific sub-intent (Tasks 4, 6, 8) ✓; OFF/DRAFT/SEND semantics with split classify-then-reply (Task 8) ✓; SEND reuses send infra (Tasks 7, 8) ✓; all five safety rails (Task 2 + Step 5 review flag) ✓; auto_sent flagging/observability (Tasks 1, 7, 8) ✓; Tier-2 shipment status via existing context (seed + Task 9) ✓; topic routing via configurable `target_folder` with legacy fallback (Tasks 1, 8) ✓; the Action Required signal (`needs_human_review` set in every non-actionable path + auto-cleared on reply) (Task 8 + Task 9 Step 7) ✓. **The admin UI (spec §7) and the Action Required *view* (spec §6) are intentionally deferred to Plan 2** — this backend guarantees the data + flags they read; the threshold and folders are editable via SQL until then.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `SubIntentRow` (incl. optional `target_folder`), `Classification`, `Autonomy`, `resolveAutonomy`, `matchSubIntent`, `buildClassificationPrompt`, `classifyMessage`, `parseClassification`, `sendViaMissive`, and `routeAndFlag(supabase, conversationId, customerId, intent, targetFolderName, needsHumanReview)` are used identically across tasks.
- **Known follow-ups (Plan 2):** admin CRUD UI for categories/sub-intents + the 3-way toggle + per-category/sub-intent **target-folder** picker; the **"Action Required" view** (saved filter on `needs_human_review` across folders) in the Messages page; `src/services/messaging.ts` data layer; surfacing `auto_sent` distinctly in the Messages thread UI; a settings control for `auto_send_confidence_threshold`.
