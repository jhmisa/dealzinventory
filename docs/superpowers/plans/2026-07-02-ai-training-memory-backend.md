# AI Training & Memory — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the messaging AI (1) a fixed edit-send path, (2) a live `get_item_specs` tool so it can answer specific factual questions from real data, and (3) a semantic "corrections memory" it retrieves and applies per message.

**Architecture:** All logic lives in Deno edge functions under `supabase/functions/_shared/` plus new Postgres RPCs. The base system prompt is assembled by `build-specialist-prompt.ts`; `generate-draft.ts` orchestrates classify → retrieve corrections → assemble prompt → draft (with tools) → send. This plan adds one tool, one spec-lookup RPC, one corrections table + match RPC, a guarded local-embedding helper, and a prompt section — reusing every existing pattern.

**Tech Stack:** Deno + TypeScript edge functions, Postgres (pgvector `gte-small` 384-dim embeddings via `Supabase.ai`), `deno test` + `jsr:@std/assert@1` for pure functions, Supabase CLI for migrations/deploys.

**Companion spec:** `docs/superpowers/specs/2026-07-02-ai-training-memory-design.md`
**Frontend plan (do after this):** `docs/superpowers/plans/2026-07-02-ai-training-memory-frontend.md`

---

## File structure

**Create:**
- `supabase/functions/_shared/send-via-missive-helpers.ts` — pure, dependency-free payload builder for the approved-draft UPDATE (testable).
- `supabase/functions/_shared/send-via-missive-helpers.test.ts` — its test.
- `supabase/functions/_shared/item-specs.ts` — `getItemSpecs()` wrapper over the new RPC.
- `supabase/functions/_shared/embeddings.ts` — guarded `embed()` via `Supabase.ai` `gte-small`.
- `supabase/functions/_shared/corrections.ts` — `retrieveCorrections()` (embed + match RPC + scoped/unscoped merge).
- `supabase/functions/_shared/ai-providers.test.ts` — tests for the new tool contract + prompt rule.
- `supabase/migrations/20260702150000_get_item_full_specs.sql` — spec-lookup RPC.
- `supabase/migrations/20260702160000_ai_corrections.sql` — pgvector, `ai_corrections` table, `match_ai_corrections` RPC.

**Modify:**
- `supabase/functions/_shared/send-via-missive.ts` — use the payload builder (bug fix).
- `supabase/functions/_shared/ai-providers.ts` — `GET_ITEM_SPECS_TOOL`, register it, `SPEC_LOOKUP_RULE`, bump tool rounds.
- `supabase/functions/_shared/build-specialist-prompt.ts` — `CorrectionExample` type + `renderLearnedCorrections()`.
- `supabase/functions/_shared/build-specialist-prompt.test.ts` — tests for `renderLearnedCorrections()`.
- `supabase/functions/_shared/generate-draft.ts` — `get_item_specs` executor case; corrections retrieval + injection.

---

## Phase 0 — Fix the edit-send bug

### Task 0.1: Persist edited content when an approved draft is marked SENT/FAILED

**Files:**
- Create: `supabase/functions/_shared/send-via-missive-helpers.ts`
- Test: `supabase/functions/_shared/send-via-missive-helpers.test.ts`
- Modify: `supabase/functions/_shared/send-via-missive.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/send-via-missive-helpers.test.ts`:

```typescript
import { assertEquals } from 'jsr:@std/assert@1';
import { buildApprovedDraftUpdate } from './send-via-missive-helpers.ts';

Deno.test('buildApprovedDraftUpdate persists edited content + attachments on success', () => {
  const p = buildApprovedDraftUpdate({
    content: 'EDITED TEXT',
    attachments: [{ file_url: 'a.jpg' }],
    autoSent: false,
    failed: false,
  });
  assertEquals(p.status, 'SENT');
  assertEquals(p.content, 'EDITED TEXT');
  assertEquals(p.attachments, [{ file_url: 'a.jpg' }]);
  assertEquals(p.auto_sent, false);
});

Deno.test('buildApprovedDraftUpdate persists edited content even on failure (retry must resend the edit, not the original)', () => {
  const p = buildApprovedDraftUpdate({ content: 'EDITED', attachments: undefined, autoSent: true, failed: true });
  assertEquals(p.status, 'FAILED');
  assertEquals(p.content, 'EDITED');
  assertEquals(p.attachments, []);
  assertEquals(p.auto_sent, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/send-via-missive-helpers.test.ts`
Expected: FAIL — module not found / `buildApprovedDraftUpdate` is not defined.

- [ ] **Step 3: Create the helper**

Create `supabase/functions/_shared/send-via-missive-helpers.ts`:

```typescript
// Pure helper for send-via-missive.ts, kept dependency-free so it is unit-testable under
// `deno test` without importing the Supabase client or reading Deno env.

export interface ApprovedDraftUpdate {
  status: 'SENT' | 'FAILED';
  auto_sent: boolean;
  content: string;
  attachments: unknown[];
}

// Build the `messages` UPDATE payload that turns an approved draft row into the sent (or failed)
// message. CRITICAL: it MUST carry the (possibly staff-edited) `content` and `attachments` —
// otherwise the surviving draft row keeps the original AI text and a retry resends the wrong
// message. This is the edit-send bug fix.
export function buildApprovedDraftUpdate(opts: {
  content: string;
  attachments?: unknown[];
  autoSent: boolean;
  failed: boolean;
}): ApprovedDraftUpdate {
  return {
    status: opts.failed ? 'FAILED' : 'SENT',
    auto_sent: opts.autoSent,
    content: opts.content,
    attachments: opts.attachments ?? [],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/send-via-missive-helpers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Use the helper in `send-via-missive.ts`**

Add the import at the top of `supabase/functions/_shared/send-via-missive.ts` (with the other `./` imports):

```typescript
import { buildApprovedDraftUpdate } from "./send-via-missive-helpers.ts";
```

Replace the approved-draft reconcile block (currently lines ~164-167):

```typescript
  if (approveDraftId) {
    await supabase.from("messages").update({ status: sendError ? "FAILED" : "SENT", auto_sent: autoSent }).eq("id", approveDraftId);
    if (!sendError) await supabase.from("messages").delete().eq("id", msg.id);
  }
```

with:

```typescript
  if (approveDraftId) {
    // Persist the (possibly edited) content + attachments onto the surviving draft row — NOT just
    // status — so the thread shows what was actually sent and a retry resends the edited text.
    await supabase.from("messages").update(
      buildApprovedDraftUpdate({ content, attachments: inputAttachments, autoSent, failed: !!sendError }),
    ).eq("id", approveDraftId);
    if (!sendError) await supabase.from("messages").delete().eq("id", msg.id);
  }
```

(Note: `content` here is already the `normalizeOutboundText(rawContent)` value — the exact text sent to Missive — which is what we want persisted.)

- [ ] **Step 6: Type-check the edge function**

Run: `deno check supabase/functions/_shared/send-via-missive.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/send-via-missive-helpers.ts supabase/functions/_shared/send-via-missive-helpers.test.ts supabase/functions/_shared/send-via-missive.ts
git commit -m "fix(messaging): persist edited draft content on send (edit-send bug)"
```

---

## Phase 1 — `get_item_specs` tool

### Task 1.1: Create the `get_item_full_specs` RPC

**Files:**
- Create: `supabase/migrations/20260702150000_get_item_full_specs.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260702150000_get_item_full_specs.sql`. The P-code and query branches mirror `search_available_inventory` (migration `20260629120000`) exactly for the item↔product_model COALESCE rules (`battery_health_pct`, `condition_notes`, `condition_grade`, `selling_price`, `discount` are **item-only**; `has_cellular`, `carrier`, `chipset`, `ports`, etc. are `COALESCE(i.x, pm.x)`). The G-code branch mirrors the representative-member LATERAL + `effective_price` expression in `20260619000000_sell_groups_rich_description.sql` — **when implementing, open that file and confirm the exact column names `sg.product_id`, `sg.discount_amount`, and the MIN(selling_price) price expression before finalizing this branch.**

```sql
-- get_item_full_specs: structured per-unit/model spec lookup for the messaging AI's
-- get_item_specs tool. Code-first (exact P/G/B), else fuzzy model-name match returning a
-- representative AVAILABLE unit. Returns a single row (or none).
-- See docs/superpowers/plans/2026-07-02-ai-training-memory-backend.md
CREATE OR REPLACE FUNCTION get_item_full_specs(
  p_code text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS TABLE (
  resolved_by text,
  code text,
  brand text,
  model_name text,
  model_number text,
  condition_grade text,
  battery_health_pct integer,
  has_cellular boolean,
  is_unlocked boolean,
  carrier text,
  has_touchscreen boolean,
  supports_stylus boolean,
  cpu text,
  gpu text,
  chipset text,
  ram_gb text,
  storage_gb text,
  screen_size numeric,
  os_family text,
  ports text,
  color text,
  year integer,
  condition_notes text,
  price numeric,
  units_may_vary boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_match_count int;
  v_search_blob text;
BEGIN
  -- 1. Exact P-code — a specific physical unit (any status; the customer may ask about a
  --    reserved/held listing they saw in an ad).
  IF v_code ~ '^P\d+$' THEN
    RETURN QUERY
    SELECT
      'code'::text, i.item_code,
      COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
      COALESCE(i.model_number, pm.model_number), i.condition_grade::text,
      i.battery_health_pct,
      COALESCE(i.has_cellular, pm.has_cellular), COALESCE(i.is_unlocked, pm.is_unlocked),
      COALESCE(i.carrier, pm.carrier), COALESCE(i.has_touchscreen, pm.has_touchscreen),
      COALESCE(i.supports_stylus, pm.supports_stylus),
      COALESCE(i.cpu, pm.cpu), COALESCE(i.gpu, pm.gpu), COALESCE(i.chipset, pm.chipset),
      COALESCE(i.ram_gb, pm.ram_gb), COALESCE(i.storage_gb, pm.storage_gb),
      COALESCE(i.screen_size, pm.screen_size), COALESCE(i.os_family, pm.os_family),
      COALESCE(i.ports, pm.ports), COALESCE(i.color, pm.color), COALESCE(i.year, pm.year),
      i.condition_notes,
      GREATEST(0, COALESCE(i.selling_price, 0) - COALESCE(i.discount, 0)),
      false
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_code = v_code
    LIMIT 1;
    RETURN;
  END IF;

  -- 2. Exact G-code — sell group; report a representative AVAILABLE member's specs.
  IF v_code ~ '^G\d+$' THEN
    RETURN QUERY
    SELECT
      'code'::text, sg.sell_group_code,
      COALESCE(rep.brand, pm.brand), COALESCE(rep.model_name, pm.model_name),
      COALESCE(rep.model_number, pm.model_number), rep.condition_grade::text,
      rep.battery_health_pct,
      COALESCE(rep.has_cellular, pm.has_cellular), COALESCE(rep.is_unlocked, pm.is_unlocked),
      COALESCE(rep.carrier, pm.carrier), COALESCE(rep.has_touchscreen, pm.has_touchscreen),
      COALESCE(rep.supports_stylus, pm.supports_stylus),
      COALESCE(rep.cpu, pm.cpu), COALESCE(rep.gpu, pm.gpu), COALESCE(rep.chipset, pm.chipset),
      COALESCE(rep.ram_gb, pm.ram_gb), COALESCE(rep.storage_gb, pm.storage_gb),
      COALESCE(rep.screen_size, pm.screen_size), COALESCE(rep.os_family, pm.os_family),
      COALESCE(rep.ports, pm.ports), COALESCE(rep.color, pm.color), COALESCE(rep.year, pm.year),
      rep.condition_notes,
      GREATEST(0, COALESCE((
        SELECT MIN(i2.selling_price) FROM sell_group_items sgi2
        JOIN items i2 ON i2.id = sgi2.item_id
        WHERE sgi2.sell_group_id = sg.id AND i2.item_status = 'AVAILABLE'
      ), 0) - COALESCE(sg.discount_amount, 0)),
      (SELECT count(*) FROM sell_group_items sgi3
       JOIN items i3 ON i3.id = sgi3.item_id
       WHERE sgi3.sell_group_id = sg.id AND i3.item_status = 'AVAILABLE') > 1
    FROM sell_groups sg
    LEFT JOIN product_models pm ON pm.id = sg.product_id
    LEFT JOIN LATERAL (
      SELECT i.* FROM sell_group_items sgi
      JOIN items i ON i.id = sgi.item_id
      WHERE sgi.sell_group_id = sg.id AND i.item_status = 'AVAILABLE'
      ORDER BY i.item_code
      LIMIT 1
    ) rep ON true
    WHERE sg.sell_group_code = v_code
    LIMIT 1;
    RETURN;
  END IF;

  -- 3. Fuzzy model-name match → representative AVAILABLE unit; flag if more than one matches.
  IF coalesce(btrim(p_query), '') <> '' THEN
    SELECT count(*) INTO v_match_count
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_status = 'AVAILABLE'
      AND public.search_matches(
            concat_ws(' ', i.item_code, COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
                      COALESCE(i.model_number, pm.model_number), COALESCE(i.color, pm.color)),
            p_query);

    RETURN QUERY
    SELECT
      'model'::text, i.item_code,
      COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
      COALESCE(i.model_number, pm.model_number), i.condition_grade::text,
      i.battery_health_pct,
      COALESCE(i.has_cellular, pm.has_cellular), COALESCE(i.is_unlocked, pm.is_unlocked),
      COALESCE(i.carrier, pm.carrier), COALESCE(i.has_touchscreen, pm.has_touchscreen),
      COALESCE(i.supports_stylus, pm.supports_stylus),
      COALESCE(i.cpu, pm.cpu), COALESCE(i.gpu, pm.gpu), COALESCE(i.chipset, pm.chipset),
      COALESCE(i.ram_gb, pm.ram_gb), COALESCE(i.storage_gb, pm.storage_gb),
      COALESCE(i.screen_size, pm.screen_size), COALESCE(i.os_family, pm.os_family),
      COALESCE(i.ports, pm.ports), COALESCE(i.color, pm.color), COALESCE(i.year, pm.year),
      i.condition_notes,
      GREATEST(0, COALESCE(i.selling_price, 0) - COALESCE(i.discount, 0)),
      v_match_count > 1
    FROM items i
    LEFT JOIN product_models pm ON pm.id = i.product_id
    WHERE i.item_status = 'AVAILABLE'
      AND public.search_matches(
            concat_ws(' ', i.item_code, COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name),
                      COALESCE(i.model_number, pm.model_number), COALESCE(i.color, pm.color)),
            p_query)
    ORDER BY i.item_code
    LIMIT 1;
    RETURN;
  END IF;

  RETURN; -- nothing to resolve
END;
$$;

GRANT EXECUTE ON FUNCTION get_item_full_specs(text, text) TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` (or `supabase migration up`). Apply automatically via CLI — do not ask.
Expected: migration applies cleanly.

- [ ] **Step 3: Verify against real data**

Pick a real AVAILABLE P-code first: `supabase db execute --stdin` (or psql) with:
```sql
SELECT item_code FROM items WHERE item_status = 'AVAILABLE' AND battery_health_pct IS NOT NULL LIMIT 1;
```
Then verify the RPC returns structured specs for it:
```sql
SELECT resolved_by, code, model_name, battery_health_pct, has_cellular, price, units_may_vary
FROM get_item_full_specs('<that P-code>', NULL);
```
Expected: one row, `resolved_by = 'code'`, `battery_health_pct` populated.
Also verify a model query returns a representative row:
```sql
SELECT resolved_by, code, model_name, units_may_vary FROM get_item_full_specs(NULL, 'iPhone 13');
```
Expected: `resolved_by = 'model'`, `units_may_vary = true` if >1 in stock.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260702150000_get_item_full_specs.sql
git commit -m "feat(messaging): add get_item_full_specs RPC for per-item spec lookup"
```

### Task 1.2: `getItemSpecs()` wrapper

**Files:**
- Create: `supabase/functions/_shared/item-specs.ts`

- [ ] **Step 1: Create the module**

Create `supabase/functions/_shared/item-specs.ts`:

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";

export interface ItemSpecs {
  resolved_by: 'code' | 'model';
  code: string;
  brand: string | null;
  model_name: string | null;
  model_number: string | null;
  condition_grade: string | null;
  battery_health_pct: number | null;
  has_cellular: boolean | null;
  is_unlocked: boolean | null;
  carrier: string | null;
  has_touchscreen: boolean | null;
  supports_stylus: boolean | null;
  cpu: string | null;
  gpu: string | null;
  chipset: string | null;
  ram_gb: string | null;
  storage_gb: string | null;
  screen_size: number | null;
  os_family: string | null;
  ports: string | null;
  color: string | null;
  year: number | null;
  condition_notes: string | null;
  price: number | null;
  units_may_vary: boolean;
}

// Look up structured specs for a specific item/model via the get_item_full_specs RPC.
// Returns the resolved row, or { found: false } so the model can ask for a code.
export async function getItemSpecs(
  supabase: ReturnType<typeof createClient>,
  args: { code?: string; query?: string },
): Promise<ItemSpecs | { found: false }> {
  // Member-access on the client so `this` stays bound (supabase-js rpc reads this.rest).
  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await db.rpc('get_item_full_specs', {
    p_code: args.code ?? null,
    p_query: args.query ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as ItemSpecs[];
  return rows[0] ?? { found: false };
}
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/_shared/item-specs.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/item-specs.ts
git commit -m "feat(messaging): getItemSpecs wrapper over get_item_full_specs RPC"
```

### Task 1.3: Register the tool + prompt rule in `ai-providers.ts`

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/ai-providers.test.ts`:

```typescript
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildEnhancedPrompt, GET_ITEM_SPECS_TOOL } from './ai-providers.ts';

Deno.test('buildEnhancedPrompt includes the spec-lookup rule', () => {
  const p = buildEnhancedPrompt('BASE_PROMPT');
  assert(p.includes('BASE_PROMPT'));
  assert(p.includes('get_item_specs'));
  assert(p.includes('has_cellular'));
});

Deno.test('GET_ITEM_SPECS_TOOL has the expected contract', () => {
  assertEquals(GET_ITEM_SPECS_TOOL.function.name, 'get_item_specs');
  assertEquals(GET_ITEM_SPECS_TOOL.function.parameters.required, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `GET_ITEM_SPECS_TOOL` not exported / rule text absent.

- [ ] **Step 3: Add the tool constant** near `SEARCH_INVENTORY_TOOL` (after line ~338) in `ai-providers.ts`:

```typescript
export const GET_ITEM_SPECS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_item_specs',
    description:
      'Look up the full structured specs of a SPECIFIC listed item to answer a factual question ' +
      '(battery health %, cellular/SIM capability, ports, CPU/RAM/storage, condition notes, exact price). ' +
      'PREFER a product code (P/G/B) from the conversation/offer — it returns the exact unit. ' +
      'If no code is available, pass the model name read from the ad/offer as `query`; the result is a ' +
      'representative unit and units_may_vary may be true — then answer at the model level and ASK the ' +
      'customer for the product code to confirm the exact battery % and price. ' +
      'Use this instead of ever telling the customer to check the manufacturer\'s website.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Exact P/G/B code if present, e.g. "P001443" or "G000022".' },
        query: { type: 'string', description: 'Model name from the ad/offer if no code, e.g. "HP Elite Dragonfly G1".' },
      },
      required: [],
    },
  },
};
```

- [ ] **Step 4: Add the prompt rule constant** near `INVENTORY_RESPONSE_RULE` (after line ~173):

```typescript
const SPEC_LOOKUP_RULE = `
# Specific factual questions about a listed item
When the customer asks a specific factual question about an item they're looking at (battery %, does it take a SIM / cellular, ports, exact CPU/RAM/storage, condition), you MUST call get_item_specs before answering — never say you don't have the info and never tell them to check the manufacturer's website.
- If a product code (P/G/B) is in the conversation or the offer, pass it as \`code\` for the exact unit.
- If there's no code, pass the model name from the ad/offer as \`query\`. If units_may_vary is true (or you matched by model), give the best model-level answer AND ask the customer for the product code so you can confirm the exact battery % and price.
- SIM/cellular: only models with has_cellular = true can use a SIM. If has_cellular is false or unknown, say it does not support a SIM (Wi-Fi only) — do NOT say yes by default.`;
```

- [ ] **Step 5: Append the rule in `buildEnhancedPrompt`** (line ~177):

```typescript
export function buildEnhancedPrompt(systemPrompt: string): string {
  return systemPrompt + "\n\n" + INVENTORY_RESPONSE_RULE + "\n\n" + CLARIFY_BEFORE_ASSUMING_RULE + "\n\n" + SPEC_LOOKUP_RULE;
}
```

- [ ] **Step 6: Register the tool** in `runChatCompletionWithTools` (line ~378):

Change:
```typescript
      body.tools = [SEARCH_INVENTORY_TOOL];
```
to:
```typescript
      body.tools = [SEARCH_INVENTORY_TOOL, GET_ITEM_SPECS_TOOL];
```

- [ ] **Step 7: Give the model an extra tool round.** In `callOpenRouter` (line ~471) change `maxToolRounds: 2` to `maxToolRounds: 3` (a spec question may follow a search, so allow both tools to fire).

- [ ] **Step 8: Run the test to verify it passes**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (2 tests). If the import fails on a missing permission, add the flag it names; if it fails to import due to a transitive module, run without flags first (`deno test supabase/functions/_shared/ai-providers.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(messaging): register get_item_specs tool + spec-lookup prompt rule"
```

### Task 1.4: Dispatch the tool in `generate-draft.ts`

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Add the import** (with the other `./` imports at the top):

```typescript
import { getItemSpecs } from "./item-specs.ts";
```

- [ ] **Step 2: Extend the executor.** Replace the `executeTool` body (currently lines ~244-260, the version that starts with `if (name !== 'search_inventory') return { error: ... }`) with:

```typescript
  const executeTool = async (name: string, args: unknown): Promise<unknown> => {
    const a = (args ?? {}) as Record<string, unknown>;
    if (name === 'search_inventory') {
      const results = await searchInventory(supabase as ReturnType<typeof createClient>, {
        query: String(a.query ?? ''),
        category_id: a.category_id ? String(a.category_id) : undefined,
        brand: a.brand ? String(a.brand) : undefined,
        price_min: a.price_min != null ? Number(a.price_min) : undefined,
        price_max: a.price_max != null ? Number(a.price_max) : undefined,
      });
      for (const r of results) offerCatalog.set(r.code, r);
      return results.map((r) => ({
        type: r.type, code: r.code, description: r.description,
        grade: r.grade, price: r.price, available_count: r.available_count, order_url: r.order_url,
      }));
    }
    if (name === 'get_item_specs') {
      return await getItemSpecs(supabase as ReturnType<typeof createClient>, {
        code: a.code ? String(a.code) : undefined,
        query: a.query ? String(a.query) : undefined,
      });
    }
    return { error: `unknown tool: ${name}` };
  };
```

(Keep the `const offerCatalog = new Map<...>()` line that precedes it unchanged.)

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(messaging): dispatch get_item_specs tool in draft generation"
```

---

## Phase 2 — Corrections memory (table, embeddings, retrieval, injection)

### Task 2.1: Migration — pgvector, `ai_corrections`, `match_ai_corrections`

**Files:**
- Create: `supabase/migrations/20260702160000_ai_corrections.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260702160000_ai_corrections.sql`:

```sql
-- AI training memory: curated corrections the messaging AI retrieves semantically and applies to
-- similar future questions. 384-dim embeddings from Supabase's built-in gte-small model.
-- See docs/superpowers/plans/2026-07-02-ai-training-memory-backend.md
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_corrections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_message        text NOT NULL,
  wrong_reply             text,
  correct_reply           text NOT NULL,
  note                    text,
  specialist_slug         text,
  sub_intent_slug         text,
  status                  text NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | PROMOTED | REJECTED
  embedding               vector(384),
  source_conversation_id  uuid,
  source_message_id       uuid,
  promoted_knowledge_id   uuid REFERENCES knowledge_base(id) ON DELETE SET NULL,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_corrections_status ON ai_corrections(status, specialist_slug);
CREATE INDEX idx_ai_corrections_embedding ON ai_corrections USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER trg_ai_corrections_updated
  BEFORE UPDATE ON ai_corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON ai_corrections FOR ALL USING (auth.role() = 'authenticated');
GRANT ALL ON public.ai_corrections TO anon, authenticated, service_role;

-- Semantic match over APPROVED/PROMOTED corrections, optionally scoped to a specialist.
CREATE OR REPLACE FUNCTION match_ai_corrections(
  query_embedding vector(384),
  filter_specialist text DEFAULT NULL,
  match_count int DEFAULT 3,
  min_similarity float DEFAULT 0.55
)
RETURNS TABLE (
  id uuid,
  customer_message text,
  correct_reply text,
  note text,
  specialist_slug text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.customer_message, c.correct_reply, c.note, c.specialist_slug,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM ai_corrections c
  WHERE c.status IN ('APPROVED', 'PROMOTED')
    AND c.embedding IS NOT NULL
    AND (filter_specialist IS NULL OR c.specialist_slug = filter_specialist)
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_ai_corrections(vector, text, int, float) TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies cleanly; `vector` extension enabled.

- [ ] **Step 3: Verify table + RPC exist and the match runs**

```sql
-- table present
SELECT count(*) FROM ai_corrections;
-- RPC runs with a zero vector (returns 0 rows, no error)
SELECT * FROM match_ai_corrections(array_fill(0::real, ARRAY[384])::vector, NULL, 3, 0.0);
```
Expected: first returns 0; second returns 0 rows with no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260702160000_ai_corrections.sql
git commit -m "feat(messaging): ai_corrections table + pgvector match_ai_corrections RPC"
```

### Task 2.2: Guarded local-embedding helper

**Files:**
- Create: `supabase/functions/_shared/embeddings.ts`

- [ ] **Step 1: Create the module**

Create `supabase/functions/_shared/embeddings.ts`:

```typescript
// Local text embeddings via Supabase's built-in gte-small model (384-dim). `Supabase.ai` exists
// only inside the Supabase edge runtime, so embed() is GUARDED and NON-FATAL: callers treat a
// null return as "skip semantic memory" and continue normally.

// deno-lint-ignore no-explicit-any
const supabaseAi = (globalThis as any).Supabase?.ai;

export async function embed(text: string): Promise<number[] | null> {
  const input = (text ?? '').trim();
  if (!input) return null;
  if (!supabaseAi) {
    console.error('embeddings: Supabase.ai unavailable in this runtime — skipping embedding');
    return null;
  }
  try {
    const session = new supabaseAi.Session('gte-small');
    // mean_pool + normalize -> a unit-length 384-d vector suitable for cosine distance.
    const output = await session.run(input, { mean_pool: true, normalize: true });
    return output as number[];
  } catch (e) {
    console.error('embeddings: embed() failed (non-fatal):', e);
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/_shared/embeddings.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/embeddings.ts
git commit -m "feat(messaging): guarded gte-small embed() helper"
```

### Task 2.3: `CorrectionExample` type + `renderLearnedCorrections()`

**Files:**
- Modify: `supabase/functions/_shared/build-specialist-prompt.ts`
- Test: `supabase/functions/_shared/build-specialist-prompt.test.ts`

- [ ] **Step 1: Add the failing tests** to `build-specialist-prompt.test.ts`.

Add `renderLearnedCorrections` to the existing import at the top of the file:

```typescript
import {
  buildSpecialistSystemPrompt,
  renderLearnedCorrections,
  specialistForIntent,
  type CompanyFact,
  type SpecialistRow,
  type TemplateReply,
} from './build-specialist-prompt.ts';
```

Append these tests at the end of the file:

```typescript
Deno.test('renderLearnedCorrections renders each correction with its note', () => {
  const out = renderLearnedCorrections([
    { customer_message: 'battery percentage po?', correct_reply: 'Look it up and share the exact %.', note: 'we track battery %' },
  ]);
  assertStringIncludes(out, '# Learned Corrections');
  assertStringIncludes(out, 'battery percentage po?');
  assertStringIncludes(out, 'Look it up and share the exact %.');
  assertStringIncludes(out, 'Why: we track battery %');
});

Deno.test('renderLearnedCorrections omits the Why line when note is empty', () => {
  const out = renderLearnedCorrections([
    { customer_message: 'q', correct_reply: 'a', note: null },
  ]);
  assertStringIncludes(out, 'q');
  assertEquals(out.includes('Why:'), false);
});

Deno.test('renderLearnedCorrections returns empty string when there are none', () => {
  assertEquals(renderLearnedCorrections([]), '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: FAIL — `renderLearnedCorrections` not exported.

- [ ] **Step 3: Add the type + function** to `build-specialist-prompt.ts`. Add the interface near the other exported interfaces (e.g. after `CompanyFact`):

```typescript
export interface CorrectionExample {
  customer_message: string;
  correct_reply: string;
  note?: string | null;
}
```

Add the exported function (e.g. right after `specialistForIntent`):

```typescript
// Render retrieved staff corrections as a high-priority section appended to the reply prompt.
// Returns '' when there are none. Kept separate from buildSpecialistSystemPrompt because
// corrections are retrieved AFTER intent classification (see generate-draft.ts).
export function renderLearnedCorrections(corrections: CorrectionExample[]): string {
  if (!corrections || corrections.length === 0) return '';
  const blocks = corrections
    .map((c) => {
      const note = c.note ? `\n  Why: ${c.note}` : '';
      return `- When the customer says something like: "${c.customer_message}"\n  Respond like this: ${c.correct_reply}${note}`;
    })
    .join('\n');
  return `\n\n# Learned Corrections (staff feedback for situations like this one — follow these over general guidance when they apply)\n${blocks}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: PASS (all existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/build-specialist-prompt.ts supabase/functions/_shared/build-specialist-prompt.test.ts
git commit -m "feat(messaging): renderLearnedCorrections prompt section"
```

### Task 2.4: `retrieveCorrections()` (embed + match + scoped/unscoped merge)

**Files:**
- Create: `supabase/functions/_shared/corrections.ts`

- [ ] **Step 1: Create the module**

Create `supabase/functions/_shared/corrections.ts`:

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { embed } from "./embeddings.ts";
import type { CorrectionExample } from "./build-specialist-prompt.ts";

interface MatchRow {
  id: string;
  customer_message: string;
  correct_reply: string;
  note: string | null;
}

// Retrieve the most relevant APPROVED/PROMOTED corrections for the incoming message. Scopes to the
// classified specialist first; if that returns fewer than matchCount, tops up with an unscoped
// search. Fully NON-FATAL: any failure (including no embedding) returns [].
export async function retrieveCorrections(
  supabase: ReturnType<typeof createClient>,
  customerMessage: string,
  specialistSlug: string | null,
  matchCount = 3,
): Promise<CorrectionExample[]> {
  const embedding = await embed(customerMessage);
  if (!embedding) return [];

  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const seen = new Set<string>();
  const out: CorrectionExample[] = [];
  const push = (rows: MatchRow[]) => {
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ customer_message: r.customer_message, correct_reply: r.correct_reply, note: r.note });
    }
  };

  try {
    if (specialistSlug) {
      const scoped = await db.rpc('match_ai_corrections', {
        query_embedding: embedding, filter_specialist: specialistSlug, match_count: matchCount,
      });
      if (!scoped.error) push((scoped.data ?? []) as MatchRow[]);
    }
    if (out.length < matchCount) {
      const unscoped = await db.rpc('match_ai_corrections', {
        query_embedding: embedding, filter_specialist: null, match_count: matchCount,
      });
      if (!unscoped.error) push((unscoped.data ?? []) as MatchRow[]);
    }
  } catch (e) {
    console.error('retrieveCorrections failed (non-fatal):', e);
  }
  return out.slice(0, matchCount);
}
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/_shared/corrections.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/corrections.ts
git commit -m "feat(messaging): retrieveCorrections semantic memory lookup"
```

### Task 2.5: Wire retrieval + injection into `generate-draft.ts`

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Add imports.** Add `renderLearnedCorrections` and the `CorrectionExample` type to the existing `build-specialist-prompt.ts` import block, and import `retrieveCorrections`:

```typescript
import {
  buildSpecialistSystemPrompt,
  renderLearnedCorrections,
  specialistForIntent,
  type SpecialistRow,
  type CompanyFact,
  type CorrectionExample,
} from "./build-specialist-prompt.ts";
import { retrieveCorrections } from "./corrections.ts";
```

- [ ] **Step 2: Retrieve corrections after classification.** Immediately after `classifiedSpecialist` is computed (line ~218, before `resolveAutonomy`), add:

```typescript
  // Retrieve curated staff corrections relevant to THIS message (semantic memory). Non-fatal.
  let corrections: CorrectionExample[] = [];
  try {
    const lastCustomer = [...chatMessages].reverse().find(
      (m) => (m as { role?: string }).role === 'user' || (m as { role?: string }).role === 'customer',
    ) as { content?: unknown } | undefined;
    const lastCustomerText = typeof lastCustomer?.content === 'string' ? lastCustomer.content : '';
    corrections = await retrieveCorrections(
      supabase as ReturnType<typeof createClient>,
      lastCustomerText,
      classifiedSpecialist?.slug ?? null,
    );
  } catch (e) {
    console.error('corrections retrieval failed (non-fatal):', e);
  }
```

(If `chatMessages` items use a different role literal than `'user'`/`'customer'`, adjust the predicate — confirm the shape passed into `classifyMessage`/`generateAIReply`.)

- [ ] **Step 3: Append the corrections section to the reply prompt.** Replace the `replySystemPrompt` assignment (lines ~262-266):

```typescript
  const replySystemPrompt = matchedSubIntent
    ? `${fullSystemPrompt}\n\n# Active sub-intent: ${matchedSubIntent.name} (HIGHEST PRIORITY)\n${matchedSubIntent.handling_instructions}`
    : fullSystemPrompt;
```

with:

```typescript
  const correctionsBlock = renderLearnedCorrections(corrections);
  const replySystemPrompt = (matchedSubIntent
    ? `${fullSystemPrompt}\n\n# Active sub-intent: ${matchedSubIntent.name} (HIGHEST PRIORITY)\n${matchedSubIntent.handling_instructions}`
    : fullSystemPrompt) + correctionsBlock;
```

- [ ] **Step 4: Type-check**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(messaging): retrieve + inject learned corrections at draft time"
```

---

## Phase 3 — Deploy & end-to-end verification

### Task 3.1: Deploy affected edge functions

- [ ] **Step 1: Deploy** the functions that bundle the changed `_shared` modules:

```bash
supabase functions deploy missive-webhook generate-pending-drafts send-message test-ai-reply
```
Expected: all deploy successfully.

- [ ] **Step 2: Confirm gte-small availability.** Trigger one real (or test-harness) message, then check edge logs:
```bash
supabase functions logs generate-pending-drafts
```
Expected: NO `Supabase.ai unavailable` line. If it appears, embeddings aren't enabled in the runtime — corrections retrieval degrades gracefully (returns []), so nothing breaks; note it and follow up on enabling the AI runtime, but do not block the rest.

### Task 3.2: Verify the two canonical cases via the Test-the-AI harness

- [ ] **Step 1: Battery % (with code).** In Messaging Settings → "Test the AI", send: "Good day, may I ask the battery life percentage of this laptop?" with a known AVAILABLE laptop P-code in the message (e.g. "P00xxxx"). Expected: the draft states the real battery %, not a deflection to HP's website.

- [ ] **Step 2: Battery % (no code).** Send the same question referencing only "HP Elite Dragonfly G1". Expected: a model-level answer plus a request for the product code to confirm exact battery % and price.

- [ ] **Step 3: SIM/cellular.** Send "Malagyan po ng sim yan??" about a Wi-Fi-only tablet model. Expected: the draft says it does not take a SIM (Wi-Fi only) — not an unqualified "yes".

- [ ] **Step 4: Corrections injection path.** The injection logic (`renderLearnedCorrections`) is already covered by the unit tests in Task 2.3, and `retrieveCorrections` degrades to `[]` when there are no embedded rows — so drafting is unaffected until corrections exist. Embeddings are generated by the app on approval (frontend plan), not in SQL, so the **full corrections end-to-end test (approve → embed → paraphrase retrieves it) lives in the frontend plan's Task B.7.** Nothing to insert or clean up here.

### Task 3.3: Regression check

- [ ] **Step 1: Run the full `_shared` test suite:**
```bash
deno test supabase/functions/_shared/
```
Expected: all tests pass (send-via-missive-helpers, ai-providers, build-specialist-prompt, sub-intents, and any others).

- [ ] **Step 2: Verify the edit-send fix live.** In a real conversation, Edit an AI draft, change the text, Send. Confirm the customer receives the edited text AND the thread shows the edited text (not the original). Then trigger a retry path if feasible and confirm it resends the edited text.

---

## Self-review notes

- **Spec coverage:** Pillar 0 → Phase 0. Pillar 1 (`get_item_specs`, code-first + ask-for-code) → Phase 1 (RPC, wrapper, tool, rule, dispatch). Pillar 2 (memory: table, hybrid tags+semantic, gte-small, injection) → Phase 2. Deploy/verify → Phase 3. Pillar 3 (capture UI + Training page) is the separate frontend plan.
- **Graceful degradation:** `embed()` and `retrieveCorrections()` are non-fatal — if `Supabase.ai` is absent, drafting continues unaffected.
- **Type consistency:** `CorrectionExample` is defined once in `build-specialist-prompt.ts` and imported by `corrections.ts` and `generate-draft.ts`. `ItemSpecs` lives in `item-specs.ts`. Tool name `get_item_specs` is identical in the tool constant, the executor dispatch, and the prompt rule.
- **Open confirmation during execution:** the G-code branch column names (`sg.product_id`, `sg.discount_amount`, price expression) must be reconciled against `20260619000000_sell_groups_rich_description.sql`; the `chatMessages` role literal (`'user'` vs `'customer'`) must be confirmed against its producer.
