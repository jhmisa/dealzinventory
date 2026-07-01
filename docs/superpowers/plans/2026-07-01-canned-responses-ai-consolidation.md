# Canned Responses → AI Agent Knowledge Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staff canned-response library (`messaging_templates`) the single authoritative source the AI reads live at draft time, and first improve those templates (better Taglish + real Japanese).

**Architecture:** *Logical unification, physical separation.* Keep `messaging_templates` and `knowledge_base` as separate tables. Phase 0 rewrites template copy. Phase 1 tags each template with a specialist + an `ai_usage` level. Phase 2 injects the specialist's templates into the AI prompt and caps auto-send by `ai_usage`; template media is attached to the draft. Phase 3 de-dups overlapping KB facts. Phase 4 gives staff one unified "Agent Knowledge" surface + video attachments.

**Tech Stack:** Supabase Postgres migrations (CLI), Deno edge functions (`supabase/functions/_shared/`, tests via `jsr:@std/assert@1` + `Deno.test`), React 18 + Vite + TanStack Query frontend.

**Spec:** [`docs/superpowers/specs/2026-07-01-canned-responses-ai-consolidation-design.md`](../specs/2026-07-01-canned-responses-ai-consolidation-design.md)

**Execution order:** Phases are sequential and each is independently shippable. Recommended: ship Phase 0 (visible customer-copy win), then Phases 1–2 (the AI value), then 3–4. Bump `package.json` once for the session; deploy edge functions + frontend via the `push-to-main` skill.

**How to run backend tests:** `deno test --allow-none supabase/functions/_shared/<file>.test.ts` (the repo's existing pattern; no network — pure functions only). If `--allow-none` is rejected by the installed Deno, use `deno test supabase/functions/_shared/<file>.test.ts`.

**How to apply migrations:** `supabase db push` (auto-applies to the linked project `aeiyinpxmazmfubotpdk`). Never edit an already-applied migration; add a new one.

---

## Phase 0 — Improve the 20 canned messages (content)

Human-in-the-loop content work. The literal rewritten strings are produced during execution and **gated on Joey's approval of a review table** before any DB write — they are intentionally not pre-written here. Everything else (format, migration mechanics, verification) is fully specified.

### Task 0.1: Snapshot the current live templates

**Files:**
- Create: `docs/superpowers/plans/artifacts/2026-07-01-templates-before.json` (working artifact, git-ignored is fine)

- [ ] **Step 1: Pull the live templates as staff (read-only)**

Run (from repo root):
```bash
set -a; source .env.local; set +a
TOKEN=$(curl -s "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEV_STAFF_EMAIL\",\"password\":\"$DEV_STAFF_PASSWORD\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
mkdir -p docs/superpowers/plans/artifacts
curl -s "$VITE_SUPABASE_URL/rest/v1/messaging_templates?select=id,name,content_en,content_ja,variables,attachments,is_active&order=name.asc" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool > docs/superpowers/plans/artifacts/2026-07-01-templates-before.json
```
Expected: a JSON array of 20 objects.

- [ ] **Step 2: Confirm count**

Run: `python3 -c "import json;print(len(json.load(open('docs/superpowers/plans/artifacts/2026-07-01-templates-before.json'))))"`
Expected: `20`

### Task 0.2: Produce the rewrite review table (APPROVAL GATE)

**Files:**
- Create: `docs/superpowers/plans/artifacts/2026-07-01-template-rewrites.md`

- [ ] **Step 1: For each of the 20 templates, draft the improved copy**

Rules (from spec §4 Phase 0):
- `content_en`: refine tone/grammar/emoji/`po` consistency, clearer CTAs, consistent greeting + sign-off. **Preserve every fact, link, price, and human fill-in blank** (e.g. `SmartPit Number:`, `Amount: ¥`, `Tracking Number:`, the PayPal URL, invoice detail blocks). Keep existing `{{order_code}}`. Do NOT invent new `{{variables}}` here (see Task 0.5).
- `content_ja`: write **proper polite business Japanese (keigo)** that faithfully conveys the improved EN message. This replaces the current JA fields, 11 of which contain no Japanese.

- [ ] **Step 2: Write the review table**

Format (one section per template):
```markdown
### {name}   [ai_usage: <proposed>] [specialist: <proposed>] [photos: N]
**Current EN:**
> …
**Proposed EN:**
> …
**Proposed JA (keigo):**
> …
**Notes:** what changed / why; any blank preserved.
```

- [ ] **Step 3: STOP and get Joey's approval**

Present the table. Do not proceed to Task 0.3 until Joey approves (edits welcome, batches OK). Record approved copy back into the same file.

### Task 0.3: Write the content migration from the APPROVED copy

**Files:**
- Create: `supabase/migrations/20260701120000_improve_canned_responses.sql`

- [ ] **Step 1: Generate the migration**

One idempotent `UPDATE … WHERE name = …` per template. Template (repeat for all 20, filling approved copy; `$$…$$` dollar-quoting avoids escaping apostrophes/emoji):
```sql
-- Improve canned responses: refined Taglish EN + real Japanese JA (2026-07-01).
-- Idempotent: keyed by name. A renamed/deleted template updates 0 rows (logged, not inserted).
UPDATE public.messaging_templates
SET content_en = $$<APPROVED EN>$$,
    content_ja = $$<APPROVED JA>$$,
    updated_at = now()
WHERE name = 'Acctg: Payment Confirmation';
-- … 19 more …
```

- [ ] **Step 2: Sanity-check the SQL parses (dry run against a scratch check)**

Run: `grep -c '^UPDATE public.messaging_templates' supabase/migrations/20260701120000_improve_canned_responses.sql`
Expected: `20`

- [ ] **Step 3: Apply the migration**

Run: `supabase db push`
Expected: migration `20260701120000_improve_canned_responses` applied, no errors.

- [ ] **Step 4: Verify every row changed and JA now contains Japanese**

Run (reuses the login pattern from Task 0.1 Step 1 to get `$TOKEN`):
```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/messaging_templates?select=name,content_ja" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json,re;d=json.load(sys.stdin);bad=[t["name"] for t in d if not re.search(r"[぀-ヿ一-鿿]",t["content_ja"] or "")];print("NO-JAPANESE:",bad or "none")'
```
Expected: `NO-JAPANESE: none`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260701120000_improve_canned_responses.sql docs/superpowers/plans/artifacts/2026-07-01-template-rewrites.md
git commit -m "feat(messaging): improve 20 canned responses (refined Taglish + real Japanese)"
```

### Task 0.4: Visual check in the Responses panel

- [ ] **Step 1: Open the app and eyeball 3 templates**

Use the `run` skill (or `npm run dev`) → log in as dev staff → Admin → Messages → open Responses. Spot-check `Info: Express Service`, `Concern: Warehouse Address`, `Acctg: Payment Confirmation`: EN reads cleanly, JA shows Japanese, attachments still present. No commit (verification only).

### Task 0.5: (Optional) Expand template variables — only if the schema supports it

**Files:**
- Modify: `src/lib/template-variables.ts`
- Modify: `src/components/messaging/canned-response-form.tsx:13`

- [ ] **Step 1: Check whether orders carry tracking fields**

Run (with `$TOKEN` from Task 0.1):
```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/orders?select=*&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print(sorted(r[0].keys()) if r else "no orders")'
```
Expected: a column list. Look for `tracking_number` / `courier` / `delivery_date` (or similar).

- [ ] **Step 2: Decide**

If those columns do NOT exist: **skip this task** — keep the manual blanks (`Tracking Number:` etc.) as-is; note in the rewrite artifact that variable expansion is deferred. If they DO exist, continue.

- [ ] **Step 3 (only if columns exist): add the variables to the resolver**

In `src/lib/template-variables.ts`, extend `TemplateContext` with `tracking_number?`, `courier?`, `delivery_date?`, and select those columns in the order query. In `canned-response-form.tsx:13` extend `AVAILABLE_VARIABLES`. Re-run the affected tracking templates through Task 0.2/0.3 to swap blanks for `{{tracking_number}}` etc. Commit as `feat(messaging): resolve tracking template variables`.

---

## Phase 1 — Make templates AI-aware (schema)

### Task 1.1: Add specialist tag + ai_usage columns

**Files:**
- Create: `supabase/migrations/20260701130000_template_ai_metadata.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Let messaging_templates participate in the AI knowledge taxonomy.
ALTER TABLE public.messaging_templates
  ADD COLUMN IF NOT EXISTS specialist_slug text,
  ADD COLUMN IF NOT EXISTS sub_intent_slug text,
  ADD COLUMN IF NOT EXISTS ai_usage text NOT NULL DEFAULT 'REFERENCE'
    CHECK (ai_usage IN ('AUTO','DRAFT','REFERENCE','OFF'));

COMMENT ON COLUMN public.messaging_templates.specialist_slug IS
  'messaging_specialists.slug this canned reply belongs to (null = shown to all).';
COMMENT ON COLUMN public.messaging_templates.ai_usage IS
  'AUTO=may auto-send near-verbatim; DRAFT=AI may use, human approves; REFERENCE=AI reads as fact only; OFF=hidden from AI.';

-- Seed sensible defaults for the current 20 (staff adjust later in the UI).
-- Self-contained → AUTO; payment-link → DRAFT; blank/data forms → REFERENCE (the column default).
UPDATE public.messaging_templates SET specialist_slug='sales' WHERE name IN
  ('Info: Probing','Info: Basic Greeting','Info: Express Service','Info: Ranking and Warranty','Order: Special Request','Order: Offer Link');
UPDATE public.messaging_templates SET specialist_slug='order_tracking' WHERE name IN
  ('Order: How to Checkout','Order: Manual Process','Order: Japan Invoice','Order: Philippines Invoice','Tracking: LBC','Tracking: Yamato','Acctg: Payment Confirmation','Acctg: PayPal Payment','Acctg: SmartPit Payment','Concern: Redelivery','Concern: Warehouse Address');
UPDATE public.messaging_templates SET specialist_slug='aftersales' WHERE name IN ('After: Feedback','Lost');
UPDATE public.messaging_templates SET specialist_slug='generalist' WHERE name IN ('Office Location');

UPDATE public.messaging_templates SET ai_usage='AUTO' WHERE name IN
  ('After: Feedback','Lost','Office Location','Concern: Warehouse Address','Concern: Redelivery',
   'Info: Basic Greeting','Info: Express Service','Info: Probing','Info: Ranking and Warranty',
   'Order: How to Checkout','Acctg: Payment Confirmation');
UPDATE public.messaging_templates SET ai_usage='DRAFT' WHERE name IN ('Acctg: PayPal Payment');
-- All others keep the REFERENCE default (blank/data forms).
```

- [ ] **Step 2: Apply**

Run: `supabase db push`
Expected: applied cleanly.

- [ ] **Step 3: Verify the distribution**

Run (with `$TOKEN`):
```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/messaging_templates?select=ai_usage" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json,collections;print(collections.Counter(t["ai_usage"] for t in json.load(sys.stdin)))'
```
Expected: a Counter with AUTO/DRAFT/REFERENCE totals summing to 20.

- [ ] **Step 4: Regenerate types & commit**

Note: `src/lib/types.ts` is a hand-maintained alias layer — do NOT run `gen types > types.ts`. Manually add `specialist_slug`, `sub_intent_slug`, `ai_usage` to the `MessagingTemplate` type (and its Insert/Update variants) in `src/lib/types.ts` matching the existing style.
```bash
git add supabase/migrations/20260701130000_template_ai_metadata.sql src/lib/types.ts
git commit -m "feat(messaging): add specialist_slug + ai_usage to canned responses"
```

---

## Phase 2 — AI reads matching templates at draft time (wiring)

### Task 2.1: Inject an "Approved Replies" section into the specialist prompt

**Files:**
- Modify: `supabase/functions/_shared/build-specialist-prompt.ts`
- Test: `supabase/functions/_shared/build-specialist-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `build-specialist-prompt.test.ts`:
```ts
import { type TemplateReply } from './build-specialist-prompt.ts';

Deno.test('buildSpecialistSystemPrompt renders Approved Replies under the owning specialist', () => {
  const templates: TemplateReply[] = [
    { name: 'Info: Express Service', content_en: 'EXPRESS_BODY', specialist_slug: 'sales', ai_usage: 'AUTO', has_media: true },
    { name: 'Order: Offer Link', content_en: 'OFFER_BODY', specialist_slug: 'sales', ai_usage: 'REFERENCE', has_media: false },
    { name: 'Off One', content_en: 'HIDDEN', specialist_slug: 'sales', ai_usage: 'OFF', has_media: false },
  ];
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: SPECIALISTS, templates,
  });
  assertStringIncludes(prompt, 'Approved Replies');
  assertStringIncludes(prompt, 'EXPRESS_BODY');
  assertStringIncludes(prompt, '[AUTO]');
  assertStringIncludes(prompt, '(has photo/video)');
  assertStringIncludes(prompt, 'OFFER_BODY');
  assertStringIncludes(prompt, '[REFERENCE]');
  // OFF templates are never shown to the model.
  assertEquals(prompt.includes('HIDDEN'), false);
});

Deno.test('buildSpecialistSystemPrompt omits Approved Replies when a specialist has none', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: SPECIALISTS, templates: [],
  });
  assertEquals(prompt.includes('Approved Replies'), false);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: FAIL (`TemplateReply` not exported; `templates` not accepted).

- [ ] **Step 3: Implement**

In `build-specialist-prompt.ts`: add the interface and an optional `templates` arg, and render per-specialist inside the existing playbook loop.
```ts
export interface TemplateReply {
  name: string;
  content_en: string;
  specialist_slug: string | null;
  ai_usage: 'AUTO' | 'DRAFT' | 'REFERENCE' | 'OFF';
  has_media: boolean;
}
```
Add `templates?: TemplateReply[];` to `BuildSpecialistPromptArgs`. Inside `buildSpecialistSystemPrompt`, after destructuring add `const templates = args.templates ?? [];`. Inside the `for (const s of active)` loop, after the knowledge block append:
```ts
      const replies = templates.filter(
        (t) => t.ai_usage !== 'OFF' && (t.specialist_slug === s.slug || t.specialist_slug === null),
      );
      if (replies.length > 0) {
        const block = replies
          .map((t) => `- "${t.name}" [${t.ai_usage}]${t.has_media ? ' (has photo/video)' : ''}:\n${t.content_en}`)
          .join('\n\n');
        prompt += `\n\nApproved Replies (prefer this exact wording; fill {{variables}}; these OVERRIDE any other knowledge on conflict):\n${block}`;
      }
```

- [ ] **Step 4: Run — verify pass**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: PASS (all tests, old + new).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/build-specialist-prompt.ts supabase/functions/_shared/build-specialist-prompt.test.ts
git commit -m "feat(ai): inject Approved Replies (canned templates) into specialist prompt"
```

### Task 2.2: Cap auto-send by template ai_usage

**Files:**
- Modify: `supabase/functions/_shared/sub-intents.ts`
- Test: `supabase/functions/_shared/sub-intents.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `sub-intents.test.ts` (imports `capAutonomyByTemplate`):
```ts
import { capAutonomyByTemplate } from './sub-intents.ts';

Deno.test('capAutonomyByTemplate: AUTO template keeps SEND', () => {
  assertEquals(capAutonomyByTemplate('SEND', 'AUTO'), 'SEND');
});
Deno.test('capAutonomyByTemplate: REFERENCE/DRAFT/OFF template downgrades SEND to DRAFT', () => {
  assertEquals(capAutonomyByTemplate('SEND', 'REFERENCE'), 'DRAFT');
  assertEquals(capAutonomyByTemplate('SEND', 'DRAFT'), 'DRAFT');
  assertEquals(capAutonomyByTemplate('SEND', 'OFF'), 'DRAFT');
});
Deno.test('capAutonomyByTemplate: no template used leaves autonomy unchanged', () => {
  assertEquals(capAutonomyByTemplate('SEND', null), 'SEND');
  assertEquals(capAutonomyByTemplate('DRAFT', 'AUTO'), 'DRAFT');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: FAIL (`capAutonomyByTemplate` not exported).

- [ ] **Step 3: Implement**

Append to `sub-intents.ts`:
```ts
/**
 * Cap an already-resolved autonomy by the ai_usage of the template the model chose to reuse.
 * Only an AUTO template may keep SEND; every other level (or a partially-blank body) forces DRAFT.
 * A null usage means the model composed its own reply (no template) — autonomy is unchanged.
 */
export function capAutonomyByTemplate(
  autonomy: Autonomy,
  templateAiUsage: 'AUTO' | 'DRAFT' | 'REFERENCE' | 'OFF' | null,
): Autonomy {
  if (autonomy !== 'SEND') return autonomy;
  if (templateAiUsage === null) return 'SEND';
  return templateAiUsage === 'AUTO' ? 'SEND' : 'DRAFT';
}
```

- [ ] **Step 4: Run — verify pass**

Run: `deno test supabase/functions/_shared/sub-intents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/sub-intents.ts supabase/functions/_shared/sub-intents.test.ts
git commit -m "feat(ai): cap auto-send by chosen template's ai_usage"
```

### Task 2.3: Return the used template from the reply pass

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `ai-providers.test.ts`:
```ts
Deno.test('parseAIResponse extracts used_template_name when present', () => {
  const r = parseAIResponse('{"reply":"hi","confidence":0.9,"used_template_name":"Info: Express Service"}');
  assertEquals(r.used_template_name, 'Info: Express Service');
});
Deno.test('parseAIResponse defaults used_template_name to null', () => {
  const r = parseAIResponse('{"reply":"hi","confidence":0.9}');
  assertEquals(r.used_template_name, null);
});
```
(Ensure the file imports `parseAIResponse` — it already tests this module.)

- [ ] **Step 2: Run — verify fail**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL (`used_template_name` undefined).

- [ ] **Step 3: Implement**

In `ai-providers.ts`:
1. Add to `AIResponse` (after `offer_codes?`): `used_template_name?: string | null;`
2. In `parseAIResponse`, in the successful-parse return object add:
   `used_template_name: typeof parsed.used_template_name === 'string' && parsed.used_template_name.length > 0 ? parsed.used_template_name : null,`
   and add `used_template_name: null,` to BOTH fallback return objects (the "looks like a normal reply" and the final "could not be parsed" ones).
3. In all FOUR provider system-prompt strings (callClaude, callOpenAI, callOpenRouter, callGemini) append one bullet to the JSON schema description, right after the `offer_codes` bullet:
   `\n- "used_template_name": if you reused one of the Approved Replies, its exact name (e.g. "Info: Express Service"); null if you wrote your own reply`

- [ ] **Step 4: Run — verify pass**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): reply pass reports which Approved Reply it reused"
```

### Task 2.4: Wire templates + media into generate-draft

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

No new unit test (this is DB-glue orchestration; covered by the pure-function tests above + the manual playground test in Task 2.5). Keep each edit minimal.

- [ ] **Step 1: Fetch active templates alongside the other config**

After the specialist fetch block (around line 112, after `const specialists = …`), add:
```ts
  // 2c-bis. Active canned templates the AI may use (Approved Replies).
  const { data: templateRows } = await supabase
    .from('messaging_templates')
    .select('name, content_en, specialist_slug, sub_intent_slug, ai_usage, attachments')
    .eq('is_active', true)
    .neq('ai_usage', 'OFF')
    .order('name');
  const templateCatalog = (templateRows ?? []) as Array<{
    name: string; content_en: string; specialist_slug: string | null;
    sub_intent_slug: string | null; ai_usage: 'AUTO'|'DRAFT'|'REFERENCE'|'OFF';
    attachments: Array<{ file_url: string; filename: string; mime_type: string; size_bytes: number }> | null;
  }>;
```

- [ ] **Step 2: Pass templates into the prompt builder**

Change the `buildSpecialistSystemPrompt({ … })` call (around line 137) to include:
```ts
    templates: templateCatalog.map((t) => ({
      name: t.name, content_en: t.content_en, specialist_slug: t.specialist_slug,
      ai_usage: t.ai_usage, has_media: (t.attachments?.length ?? 0) > 0,
    })),
```

- [ ] **Step 3: After the reply pass, resolve the used template + cap autonomy**

Import `capAutonomyByTemplate` at the top (add to the existing `./sub-intents.ts` import). After `const aiResponse = await generateAIReply(…)` (line ~246) add:
```ts
  // Resolve which Approved Reply the model reused (if any) and cap autonomy by its ai_usage.
  const usedTemplate = aiResponse.used_template_name
    ? templateCatalog.find((t) => t.name === aiResponse.used_template_name) ?? null
    : null;
  const effectiveAutonomy = capAutonomyByTemplate(autonomy, usedTemplate?.ai_usage ?? null);
```
Then replace the two later uses of `autonomy` in the SEND/DRAFT branches with `effectiveAutonomy`:
- line ~305 `if (autonomy === "SEND" && inserted?.id)` → `if (effectiveAutonomy === "SEND" && inserted?.id)`
- Also update the `ai_context_summary` JSON: change `autonomy,` (line ~294) to `autonomy: effectiveAutonomy,` and add `used_template_name: aiResponse.used_template_name ?? null,`.

- [ ] **Step 4: Attach the used template's media to the draft**

The template's `attachments` already match the message `attachments` shape, so merge them with any offer photos. Before the `messages.insert` (line ~284), change:
```ts
  const templateAttachments = usedTemplate?.attachments ?? [];
  const allAttachments = [...offerAttachments, ...templateAttachments];
```
Then use `allAttachments` in place of `offerAttachments` in: the `messages.insert` `attachments:` field (line ~291) AND the `sendViaMissive` `attachments:` field (line ~308).

- [ ] **Step 5: Type-check the function**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no type errors.

- [ ] **Step 6: Run the full shared test suite (no regressions)**

Run: `deno test supabase/functions/_shared/`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): draft reuses approved templates + attaches their media, autonomy capped by ai_usage"
```

### Task 2.5: End-to-end check in the Test-AI playground

- [ ] **Step 1: Deploy the edge functions**

The playground calls the deployed `test-ai-reply`, which imports `_shared`. Deploy:
```bash
supabase functions deploy test-ai-reply generate-pending-drafts missive-webhook
```
Expected: deploy success.

- [ ] **Step 2: Exercise scenarios in Settings → AI Agent → Test AI**

Confirm by observation (no commit):
- "magkano po shipping at payment?" → draft uses the `Info: Basic Greeting` / `Info: Express Service` wording.
- "saan ko po ipapadala yung unit?" → draft is the `Concern: Warehouse Address` copy with the correct address; if it has a photo, it attaches.
- "pano po mag-checkout?" → `Order: How to Checkout` wording.
- A SmartPit/PayPal question → the reply is a DRAFT (never auto-sent), because those templates are REFERENCE/DRAFT.
- A no-matching-template question (e.g. random small talk) → behaves as before (KB/playbook only).

---

## Phase 3 — Reconcile the knowledge_base (de-dup; deferrable)

### Task 3.1: Identify overlaps (APPROVAL GATE)

**Files:**
- Create: `docs/superpowers/plans/artifacts/2026-07-01-kb-reconciliation.md`

- [ ] **Step 1: Pull KB entries**

Run (with `$TOKEN`):
```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/knowledge_base?select=id,entry_type,title,content,is_active&order=title" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

- [ ] **Step 2: List each KB article whose facts a template now owns**

Likely overlaps: Shipping / Payment Methods (↔ `Info: Basic Greeting`, `Info: Express Service`), Warranty/Ranking (↔ `Info: Ranking and Warranty`). For each, propose: **trim** (remove the duplicated facts, keep only what no template covers) or **retire** (`is_active=false`). Write the proposal to the artifact and get Joey's approval. Guardrails are never touched.

### Task 3.2: Apply the reconciliation migration

**Files:**
- Create: `supabase/migrations/20260701140000_reconcile_knowledge_base.sql`

- [ ] **Step 1: Write approved `UPDATE`s** (e.g. `UPDATE public.knowledge_base SET content=$$…$$ WHERE title='Shipping';` / `SET is_active=false`).
- [ ] **Step 2: Apply** — Run: `supabase db push`
- [ ] **Step 3: Regression** — In the Test-AI playground, re-run the Phase 2.5 scenarios; confirm the AI still answers correctly (now sourced from templates, not the trimmed KB).
- [ ] **Step 4: Commit** — `git commit -m "feat(ai): de-dup knowledge_base facts now owned by canned templates"`

---

## Phase 4 — Unified "Agent Knowledge" surface + video attachments

### Task 4.1: Extend the canned-response service + type

**Files:**
- Modify: `src/services/messaging.ts` (Templates section)
- Modify: `src/lib/types.ts` (`MessagingTemplate` — already done in Task 1.1 Step 4)

- [ ] **Step 1: Include the new fields in create/update payloads**

Ensure `createTemplate`/`updateTemplate` in `src/services/messaging.ts` pass through `specialist_slug`, `sub_intent_slug`, `ai_usage` (they likely spread the payload; confirm the select in `getTemplates` returns them). No test runner for frontend — verify by TypeScript build in Task 4.4.

- [ ] **Step 2: Commit** — `git commit -m "feat(messaging): template service carries specialist + ai_usage"`

### Task 4.2: Add the controls to the canned-response form

**Files:**
- Modify: `src/components/messaging/canned-response-form.tsx`

- [ ] **Step 1: Add local state + controls**

Add `const [specialistSlug, setSpecialistSlug] = useState(template?.specialist_slug ?? '')` and `const [aiUsage, setAiUsage] = useState<'AUTO'|'DRAFT'|'REFERENCE'|'OFF'>(template?.ai_usage ?? 'REFERENCE')`. Render a shadcn `Select` for each below the Japanese field: specialist options from `useSpecialists()`; ai_usage options AUTO/DRAFT/REFERENCE/OFF with helper text ("AUTO = AI may auto-send · REFERENCE = AI reads only"). Include both in the `payload` object in `handleSave`.

- [ ] **Step 2: Allow video attachments**

The upload already accepts any file (`handleFileSelect`, 10MB cap). Widen the preview: when `att.mime_type?.startsWith('video/')`, show a `<video>` thumbnail or a film icon instead of `FileIcon`. Raise the cap for video to 50MB (`file.size > 50 * 1024 * 1024`). Images continue to follow the 1080/256 WebP standard elsewhere; message-attachment video is stored as-is in `messaging-attachments`.

- [ ] **Step 3: Commit** — `git commit -m "feat(messaging): specialist + ai_usage + video controls on canned-response form"`

### Task 4.3: Unified "Agent Knowledge" view in Settings → AI Agent

**Files:**
- Create: `src/components/messaging/agent-knowledge-panel.tsx`
- Modify: `src/pages/admin/messaging-settings.tsx`

- [ ] **Step 1: Build the panel**

New component composing existing hooks `useKnowledgeBase()` + `useTemplates()` into one list. Each row shows: a **kind** badge (Knowledge / Guardrail / Canned Message), the title/name, the specialist tag, and — for canned messages — the `ai_usage` badge. A filter bar toggles kind and specialist. Clicking a knowledge row opens the existing KB editor; clicking a canned message opens `CannedResponseForm`. Reuse the existing editors — this view is a unified index, not a new editor.

- [ ] **Step 2: Mount it**

In `messaging-settings.tsx`, add an "Agent Knowledge" section/tab that renders `<AgentKnowledgePanel />` above (or replacing) the separate KB + templates sections. Keep the standalone Responses panel in Messages untouched (it stays the fast insert/send view).

- [ ] **Step 3: Commit** — `git commit -m "feat(messaging): unified Agent Knowledge surface (KB + canned messages)"`

### Task 4.4: Build + visual verification

- [ ] **Step 1: Type-check / build**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 2: Visual check**

Via the `run` skill: Settings → AI Agent → Agent Knowledge shows both kinds with badges; editing a canned message shows the specialist + ai_usage selectors; the `ai_usage` badge appears on the Responses panel too. Adding a short video to a template previews and saves. No commit (verification).

### Task 4.5: Update project state + deploy

- [ ] **Step 1: Update `docs/PROJECT_STATE.md`** Now/Recently-shipped with what shipped and what it touched.
- [ ] **Step 2: Deploy** via the `push-to-main` skill (bumps `package.json`, commits, pushes → Vercel + edge functions).

---

## Self-Review (author check)

- **Spec coverage:** Phase 0 (rewrite EN+JA, review gate, migration) ✓; new-variable expansion gated on schema ✓; Phase 1 (`specialist_slug`, `sub_intent_slug`, `ai_usage` enum + seeding) ✓; Phase 2 (Approved Replies injection, effective-autonomy = min(sub_intent, template), used_template return, media attach, playground test) ✓; Phase 3 (KB de-dup, gated) ✓; Phase 4 (unified surface, form controls, video, badges) ✓.
- **Placeholders:** the only intentionally-deferred content is the literal rewritten copy (Task 0.2) and KB edits (Task 3.1) — both are human-approval gates, not code placeholders. All code/migration/test steps carry real content.
- **Type consistency:** `TemplateReply` (Task 2.1) fields match the `templateCatalog.map` in Task 2.4; `ai_usage` union `'AUTO'|'DRAFT'|'REFERENCE'|'OFF'` is identical across schema (1.1), prompt builder (2.1), `capAutonomyByTemplate` (2.2), and generate-draft (2.4); `used_template_name` is the single agreed field name across ai-providers (2.3) and generate-draft (2.4).
- **Known assumption:** default specialist/ai_usage seeding (Task 1.1) is a starting point staff refine in the Phase 4 UI; not load-bearing for correctness.
