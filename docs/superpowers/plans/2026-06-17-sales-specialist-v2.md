# Sales Specialist v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the messaging AI's Sales specialist qualify broad asks then hand a summarized lead to a human, and — for specific "is this still available?" asks — identify the item, search live inventory exactly like a human agent, and make the offer itself (text + `/mine/{code}` link, then photo).

**Architecture:** Add LLM **function-calling** to the OpenRouter messaging call so the model can invoke a `search_inventory` tool. The tool runs **in-process** in the edge function via Postgres RPCs (no public endpoint). Item search reuses the existing `search_available_inventory` RPC; a new `search_available_sell_groups` RPC adds G-code groups. The model's offer text embeds a server-built `/mine/{code}` link (no URL hallucination). Behavior is driven by a rewritten Sales playbook row + a scoped global inventory rule. A final phase attaches the product photo to the draft.

**Tech Stack:** Supabase Postgres (plpgsql RPCs), Deno edge functions (TypeScript), OpenRouter/gpt-4o (tools + vision), React/Vite frontend. Edge logic is TDD via `deno test`; frontend changes verified via `npm run lint` + `npx tsc --noEmit` (no frontend test runner exists in this repo).

**Spec:** `docs/superpowers/specs/2026-06-17-sales-specialist-v2-design.md`

**Phasing:** Phases 1–3 deliver the working **text** offer (link, no photo) and the qualify-then-handoff behavior. Phase 4 adds the photo. Each phase is independently testable and shippable.

**Conventions (from CLAUDE.md + project memory):**
- Migrations applied via the Supabase **CLI** (`supabase db push`), never the MCP. Branch off `main`.
- Run a deno test file with: `deno test <path>` (pure tests need no permission flags).
- DB smoke queries use `psql "$SUPABASE_DB_URL" -c "..."` (connection string is in your `.env`; see `.env.backup.example`).
- After merge: `supabase functions deploy generate-pending-drafts test-ai-reply`, then push.

---

## File Structure

**Phase 1 — search reachable from the edge**
- Create: `supabase/migrations/20260617150000_search_available_sell_groups.sql` — new RPC returning available sell groups (G-codes).
- Create: `supabase/functions/_shared/inventory-search.ts` — `searchInventory()` merging item + sell-group RPC results into a unified shape with a server-built `order_url`.
- Create: `supabase/functions/_shared/inventory-search.test.ts` — Deno tests for the mapping/merge/url logic.

**Phase 2 — the tool (function-calling loop)**
- Modify: `supabase/functions/_shared/ai-providers.ts` — add the `search_inventory` tool schema, a pure `runChatCompletionWithTools()` loop, and thread an optional tool context through `generateAIReply` → `callOpenRouter`.
- Modify: `supabase/functions/_shared/ai-providers.test.ts` — tests for the tool loop.
- Modify: `supabase/functions/_shared/generate-draft.ts` — inject the `searchInventory`-backed tool executor.

**Phase 3 — behavior**
- Modify: `supabase/functions/_shared/ai-providers.ts` — scope `INVENTORY_RESPONSE_RULE`.
- Modify: `supabase/functions/_shared/ai-providers.test.ts` — assert the scoped rule text.
- Create: `supabase/migrations/20260617160000_sales_specialist_v2_playbook.sql` — rewrite the `messaging_specialists` slug='sales' playbook.

**Phase 4 — offer photo**
- Modify: `supabase/functions/_shared/ai-providers.ts` — add `offer_codes` to `AIResponse` + parser + JSON instruction.
- Modify: `supabase/functions/_shared/ai-providers.test.ts` — test `offer_codes` parsing.
- Modify: `supabase/functions/_shared/generate-draft.ts` — copy offered product photos into `messaging-attachments`, set draft `attachments`.
- Modify: `src/components/messaging/ai-draft-card.tsx` — render the draft's attachment preview.
- Modify: `src/components/messaging/conversation-thread.tsx` + `src/pages/admin/messages.tsx` — pass `message.attachments` through on approve.

---

## Phase 1 — Inventory search reachable from the edge

### Task 1.1: New `search_available_sell_groups` RPC

**Files:**
- Create: `supabase/migrations/20260617150000_search_available_sell_groups.sql`

Mirrors the client-side `searchAvailableSellGroups` logic (`src/services/items.ts:558`) in SQL: only `active` groups whose member items are `AVAILABLE`, matched by G-code / brand / model_name, with effective price = representative item `selling_price − sell_group.discount_amount`.

- [ ] **Step 1: Write the migration**

```sql
-- search_available_sell_groups: available sell groups (G-codes) for the messaging AI tool
-- and (optionally) the inventory modal. Mirrors src/services/items.ts searchAvailableSellGroups.
CREATE OR REPLACE FUNCTION search_available_sell_groups(
  search_query text,
  result_limit int DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sell_group_code text,
  condition_grade text,
  effective_price numeric,
  available_count integer,
  brand text,
  model_name text,
  hero_media_url text
) AS $$
BEGIN
  RETURN QUERY
  WITH groups AS (
    SELECT
      sg.id,
      sg.sell_group_code,
      sg.condition_grade::text AS condition_grade,
      pm.brand,
      pm.model_name,
      pm.category_id,
      GREATEST(0, COALESCE(MIN(i.selling_price), 0) - COALESCE(sg.discount_amount, 0)) AS effective_price,
      COUNT(i.id)::int AS available_count,
      (SELECT pmed.file_url FROM product_media pmed
        WHERE pmed.product_id = pm.id
        ORDER BY CASE WHEN pmed.role = 'hero' THEN 0 ELSE 1 END, pmed.sort_order
        LIMIT 1) AS hero_media_url
    FROM sell_groups sg
    JOIN product_models pm ON pm.id = sg.product_model_id
    JOIN sell_group_items sgi ON sgi.sell_group_id = sg.id
    JOIN items i ON i.id = sgi.item_id AND i.item_status = 'AVAILABLE'
    WHERE sg.active = true
      AND (filter_brand IS NULL OR pm.brand ILIKE filter_brand)
      AND (filter_category_id IS NULL OR pm.category_id = filter_category_id)
      AND (
        search_query IS NULL OR search_query = '' OR (
          sg.sell_group_code ILIKE '%' || search_query || '%'
          OR pm.brand ILIKE '%' || search_query || '%'
          OR pm.model_name ILIKE '%' || search_query || '%'
          OR CONCAT_WS(' ', pm.brand, pm.model_name) ILIKE '%' || search_query || '%'
        )
      )
    GROUP BY sg.id, sg.sell_group_code, sg.condition_grade, pm.brand, pm.model_name, pm.category_id, sg.discount_amount
  )
  SELECT g.id, g.sell_group_code, g.condition_grade, g.effective_price, g.available_count,
         g.brand, g.model_name, g.hero_media_url
  FROM groups g
  WHERE (price_min IS NULL OR g.effective_price >= price_min)
    AND (price_max IS NULL OR g.effective_price <= price_max)
  ORDER BY
    CASE WHEN search_query IS NOT NULL AND search_query != '' AND g.sell_group_code ILIKE search_query THEN 0 ELSE 1 END,
    g.sell_group_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_sell_groups(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;
```

> Note: verify column names `sell_groups.product_model_id`, `sell_groups.discount_amount`, `sell_group_items.sell_group_id/item_id` against `docs/DATABASE_SCHEMA.md` before applying. The client query at `src/services/items.ts:564-580` confirms `product_models` join, `sell_group_items.items`, `discount_amount`, `condition_grade`, and `product_media(file_url, role, sort_order)`.

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration `20260617150000_search_available_sell_groups` applied, no error.

- [ ] **Step 3: Smoke-test the RPC against real data**

Run (pick a brand you know is in stock, e.g. from the screenshot, "Iris" or "Blackview"):
```bash
psql "$SUPABASE_DB_URL" -c "SELECT sell_group_code, brand, model_name, effective_price, available_count FROM search_available_sell_groups('Iris', 10, NULL, NULL, NULL, NULL);"
```
Expected: ≥0 rows; if Iris Ohyama LUCA is in stock, its `G…` code appears with `available_count ≥ 1` and a sane `effective_price`. No SQL error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617150000_search_available_sell_groups.sql
git commit -m "feat(ai): add search_available_sell_groups RPC for the inventory tool"
```

---

### Task 1.2: Edge `searchInventory()` unified module

**Files:**
- Create: `supabase/functions/_shared/inventory-search.ts`
- Test: `supabase/functions/_shared/inventory-search.test.ts`

Merges the two RPCs into one result list and builds the `/mine/{code}` order link server-side.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/inventory-search.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { mapInventoryResults, buildOrderUrl, type RawItemRow, type RawSellGroupRow } from './inventory-search.ts';

Deno.test('buildOrderUrl strips trailing /shop and appends /mine/{code}', () => {
  assertEquals(buildOrderUrl('https://dealzinventory.vercel.app/shop', 'G000022'),
    'https://dealzinventory.vercel.app/mine/G000022');
  assertEquals(buildOrderUrl('https://dealzinventory.vercel.app', 'P000825'),
    'https://dealzinventory.vercel.app/mine/P000825');
});

Deno.test('mapInventoryResults merges items + sell groups with order_url and effective price', () => {
  const items: RawItemRow[] = [{
    id: 'i1', item_code: 'P000825', condition_grade: 'A', selling_price: 7900, discount: 0,
    brand: 'Iris Ohyama', model_name: 'LUCA Tablet TM101',
    first_item_display_url: 'https://cdn/p.jpg', first_item_thumb_url: 'https://cdn/p_t.jpg',
    hero_media_url: null, first_product_media_url: null, condition_notes: null,
  }];
  const groups: RawSellGroupRow[] = [{
    id: 'g1', sell_group_code: 'G000022', condition_grade: 'A', effective_price: 7900,
    available_count: 1, brand: 'Iris Ohyama', model_name: 'LUCA Tablet TM101',
    hero_media_url: 'https://cdn/g.jpg',
  }];
  const out = mapInventoryResults(items, groups, 'https://dealzinventory.vercel.app');
  assertEquals(out.length, 2);
  const group = out.find((r) => r.type === 'sell_group')!;
  assertEquals(group.code, 'G000022');
  assertEquals(group.price, 7900);
  assertEquals(group.available_count, 1);
  assertEquals(group.order_url, 'https://dealzinventory.vercel.app/mine/G000022');
  const item = out.find((r) => r.type === 'item')!;
  assertEquals(item.code, 'P000825');
  assertEquals(item.order_url, 'https://dealzinventory.vercel.app/mine/P000825');
  assertEquals(item.display_url, 'https://cdn/p.jpg');
});

Deno.test('mapInventoryResults applies item discount to price', () => {
  const items: RawItemRow[] = [{
    id: 'i2', item_code: 'P000001', condition_grade: 'B', selling_price: 10000, discount: 1500,
    brand: 'Dell', model_name: 'OptiPlex',
    first_item_display_url: null, first_item_thumb_url: null, hero_media_url: null,
    first_product_media_url: null, condition_notes: null,
  }];
  const out = mapInventoryResults(items, [], 'https://x.app');
  assertEquals(out[0].price, 8500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts`
Expected: FAIL — `Module not found` / `mapInventoryResults is not exported`.

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/_shared/inventory-search.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

export interface RawItemRow {
  id: string;
  item_code: string;
  condition_grade: string | null;
  selling_price: number | null;
  discount: number | null;
  brand: string | null;
  model_name: string | null;
  first_item_display_url: string | null;
  first_item_thumb_url: string | null;
  hero_media_url: string | null;
  first_product_media_url: string | null;
  condition_notes: string | null;
}

export interface RawSellGroupRow {
  id: string;
  sell_group_code: string;
  condition_grade: string | null;
  effective_price: number | null;
  available_count: number | null;
  brand: string | null;
  model_name: string | null;
  hero_media_url: string | null;
}

export interface InventorySearchResult {
  type: 'item' | 'sell_group';
  code: string;
  description: string;
  grade: string | null;
  price: number | null;
  available_count: number | null;
  thumbnail_url: string | null;
  display_url: string | null;
  order_url: string;
}

export interface InventorySearchArgs {
  query: string;
  category_id?: string;
  brand?: string;
  price_min?: number;
  price_max?: number;
}

export function buildOrderUrl(base: string, code: string): string {
  const root = base.replace(/\/shop\/?$/, '').replace(/\/$/, '');
  return `${root}/mine/${code}`;
}

function shopBase(): string {
  return Deno.env.get('PUBLIC_SHOP_URL') ?? 'https://dealzinventory.vercel.app';
}

export function mapInventoryResults(
  items: RawItemRow[],
  groups: RawSellGroupRow[],
  base: string,
): InventorySearchResult[] {
  const itemResults: InventorySearchResult[] = items.map((r) => {
    const discount = Number(r.discount) || 0;
    const price = r.selling_price != null ? r.selling_price - discount : null;
    const display = r.first_item_display_url ?? r.hero_media_url ?? r.first_product_media_url ?? null;
    const thumb = r.first_item_thumb_url ?? display;
    const desc = [r.brand, r.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'item' as const,
      code: r.item_code,
      description: r.condition_notes ? `${desc} — ${r.condition_notes}` : desc,
      grade: r.condition_grade,
      price,
      available_count: 1,
      thumbnail_url: thumb,
      display_url: display,
      order_url: buildOrderUrl(base, r.item_code),
    };
  });

  const groupResults: InventorySearchResult[] = groups.map((g) => {
    const desc = [g.brand, g.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'sell_group' as const,
      code: g.sell_group_code,
      description: `${desc} (${g.available_count ?? 0} available)`,
      grade: g.condition_grade,
      price: g.effective_price,
      available_count: g.available_count ?? 0,
      thumbnail_url: g.hero_media_url,
      display_url: g.hero_media_url,
      order_url: buildOrderUrl(base, g.sell_group_code),
    };
  });

  return [...groupResults, ...itemResults];
}

export async function searchInventory(
  supabase: ReturnType<typeof createClient>,
  args: InventorySearchArgs,
): Promise<InventorySearchResult[]> {
  const q = (args.query ?? '').trim();
  const common = {
    search_query: q,
    result_limit: 10,
    filter_brand: args.brand ?? null,
    filter_category_id: args.category_id ?? null,
    price_min: args.price_min ?? null,
    price_max: args.price_max ?? null,
  };

  const [itemsRes, groupsRes] = await Promise.all([
    supabase.rpc('search_available_inventory', common),
    supabase.rpc('search_available_sell_groups', common),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (groupsRes.error) throw groupsRes.error;

  return mapInventoryResults(
    (itemsRes.data ?? []) as RawItemRow[],
    (groupsRes.data ?? []) as RawSellGroupRow[],
    shopBase(),
  ).slice(0, 12);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/inventory-search.ts supabase/functions/_shared/inventory-search.test.ts
git commit -m "feat(ai): edge searchInventory() merging item + sell-group RPCs with /mine order_url"
```

---

## Phase 2 — The `search_inventory` tool (function-calling loop)

### Task 2.1: Pure tool-loop runner + tool schema

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

Extract the multi-turn loop as a pure function with injected `fetch` and `executeTool` so it is unit-testable.

- [ ] **Step 1: Write the failing test (append to ai-providers.test.ts)**

```typescript
import { runChatCompletionWithTools, SEARCH_INVENTORY_TOOL } from './ai-providers.ts';

Deno.test('SEARCH_INVENTORY_TOOL declares the function name and query param', () => {
  assertEquals(SEARCH_INVENTORY_TOOL.function.name, 'search_inventory');
  assertEquals(typeof SEARCH_INVENTORY_TOOL.function.parameters.properties.query, 'object');
});

Deno.test('runChatCompletionWithTools executes a tool call then returns final content', async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const responses = [
    // 1st model turn: request a tool call
    {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant', content: null,
          tool_calls: [{ id: 'call_1', type: 'function',
            function: { name: 'search_inventory', arguments: JSON.stringify({ query: 'LUCA tablet' }) } }],
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
    // 2nd model turn: final answer
    {
      choices: [{ finish_reason: 'stop', message: { role: 'assistant',
        content: JSON.stringify({ reply: 'Opo available po: G000022', confidence: 0.9, intent: 'product_inquiry', data_used: ['G000022'], escalation_reason: null }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    },
  ];
  let i = 0;
  const fakeFetch = (_url: string, _init: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(responses[i++]) } as Response);

  const executeTool = (name: string, args: unknown) => {
    calls.push({ name, args });
    return Promise.resolve([{ code: 'G000022', price: 7900 }]);
  };

  const result = await runChatCompletionWithTools({
    fetchImpl: fakeFetch as typeof fetch,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: 'k', model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'meron pa po nito?' }],
    executeTool, maxToolRounds: 3,
  });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, 'search_inventory');
  assertEquals((calls[0].args as { query: string }).query, 'LUCA tablet');
  assertEquals(result.finalText.includes('G000022'), true);
  assertEquals(result.usage.input_tokens, 30); // summed across both turns
});

Deno.test('runChatCompletionWithTools returns immediately when no tool call', async () => {
  const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
    choices: [{ finish_reason: 'stop', message: { content: '{"reply":"hi","confidence":0.8}' } }],
    usage: { prompt_tokens: 5, completion_tokens: 1 },
  }) } as Response);
  const result = await runChatCompletionWithTools({
    fetchImpl: fakeFetch as typeof fetch, url: 'u', apiKey: 'k', model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    executeTool: () => Promise.reject(new Error('should not be called')), maxToolRounds: 3,
  });
  assertEquals(result.finalText, '{"reply":"hi","confidence":0.8}');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `runChatCompletionWithTools is not exported`.

- [ ] **Step 3: Implement the runner + tool schema (add to ai-providers.ts, above `callOpenRouter`)**

```typescript
// ---------- Tool: search_inventory ----------

export const SEARCH_INVENTORY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_inventory',
    description:
      'Search Dealz live AVAILABLE inventory for products to confirm availability and make an offer. ' +
      'Use when a customer asks if a specific item is still available, names a model/code, or sends a photo/screenshot of a listing. ' +
      'Returns matching items (P-codes) and sell groups (G-codes) with code, description, grade, price, and order_url.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Model name, brand, code, or keywords read from the message/image, e.g. "Iris Ohyama LUCA tablet" or "G000022".' },
        category_id: { type: 'string', description: 'Optional category UUID filter.' },
        brand: { type: 'string', description: 'Optional exact brand filter.' },
        price_min: { type: 'number', description: 'Optional minimum yen price.' },
        price_max: { type: 'number', description: 'Optional maximum yen price.' },
      },
      required: ['query'],
    },
  },
};

type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type LoopMessage = { role: string; content: string | unknown[] | null; tool_calls?: ToolCall[]; tool_call_id?: string };

export interface ToolLoopArgs {
  fetchImpl: typeof fetch;
  url: string;
  apiKey: string;
  model: string;
  messages: LoopMessage[];
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  maxToolRounds: number;
}

export interface ToolLoopResult {
  finalText: string;
  usage: TokenUsage;
}

// Multi-turn OpenAI-compatible chat loop: runs tool calls in-process until the model
// returns a normal (content) message. Provider-agnostic over any OpenAI-shaped endpoint.
export async function runChatCompletionWithTools(args: ToolLoopArgs): Promise<ToolLoopResult> {
  const messages = [...args.messages];
  let inTok = 0, outTok = 0;

  for (let round = 0; round <= args.maxToolRounds; round++) {
    // After exhausting tool rounds, force a normal answer (omit tools).
    const includeTools = round < args.maxToolRounds;
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: 1024,
      messages,
      response_format: { type: 'json_object' },
    };
    if (includeTools) body.tools = [SEARCH_INVENTORY_TOOL];

    // Retry 503/429 with backoff (mirrors existing provider behavior).
    let data: Record<string, unknown> | null = null;
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      const res = await args.fetchImpl(args.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { data = await res.json(); break; }
      lastError = await res.text();
      const status = (res as Response).status;
      if (status !== 503 && status !== 429) throw new Error(`Tool-loop API error ${status}: ${lastError}`);
      if (attempt === 2) throw new Error(`Tool-loop API error after 3 retries: ${lastError}`);
    }
    if (!data) throw new Error('Tool-loop: no response');

    const usage = extractUsage('openrouter', data);
    inTok += usage.input_tokens; outTok += usage.output_tokens;

    const choice = (data.choices as Array<{ finish_reason?: string; message: LoopMessage }>)?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls ?? [];

    if (!toolCalls.length) {
      const content = typeof msg?.content === 'string' ? msg.content : '';
      return { finalText: content, usage: { input_tokens: inTok, output_tokens: outTok } };
    }

    // Record the assistant tool-call turn, then each tool result.
    messages.push({ role: 'assistant', content: msg!.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let parsed: unknown = {};
      try { parsed = JSON.parse(tc.function.arguments || '{}'); } catch { parsed = {}; }
      let result: unknown;
      try { result = await args.executeTool(tc.function.name, parsed); }
      catch (err) { result = { error: err instanceof Error ? err.message : 'tool error' }; }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  // Unreachable in practice — the final round omits tools and returns content above.
  return { finalText: '', usage: { input_tokens: inTok, output_tokens: outTok } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (all prior tests + the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): search_inventory tool schema + pure runChatCompletionWithTools loop"
```

---

### Task 2.2: Wire the loop into `callOpenRouter` / `generateAIReply`

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts:116-139` (`generateAIReply`), `:252-316` (`callOpenRouter`)

Thread an optional tool executor through. When present (and provider is OpenRouter), use the tool loop; otherwise keep today's single-shot path unchanged.

- [ ] **Step 1: Add the executor type + param to `generateAIReply`**

Replace the signature + OpenRouter dispatch:

```typescript
export type ToolExecutor = (name: string, args: unknown) => Promise<unknown>;

export async function generateAIReply(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  latestImages: VisionImage[] = [],
  executeTool?: ToolExecutor,
): Promise<AIResponse> {
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt);
  const images = modelSupportsVision(provider.provider, provider.model_id) ? latestImages : [];

  switch (provider.provider) {
    case 'anthropic':
      return callClaude(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openai':
      return callOpenAI(provider, enhancedPrompt, contextBlock, messages, images);
    case 'google':
      return callGemini(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openrouter':
      return callOpenRouter(provider, enhancedPrompt, contextBlock, messages, images, executeTool);
    default:
      throw new Error(`Unsupported provider: ${provider.provider}`);
  }
}
```

- [ ] **Step 2: Update `callOpenRouter` to use the loop when an executor is provided**

After the `openrouterMessages` array + image attachment block (`ai-providers.ts:259-278`), replace the retry/fetch block (`:280-315`) with:

```typescript
  // Tool-enabled path: run the multi-turn loop so the model can call search_inventory.
  if (executeTool) {
    const { finalText, usage } = await runChatCompletionWithTools({
      fetchImpl: fetch,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: provider.api_key_encrypted,
      model: provider.model_id,
      messages: openrouterMessages as LoopMessage[],
      executeTool,
      maxToolRounds: 2,
    });
    return { ...parseAIResponse(finalText), usage };
  }

  // (existing single-shot retry/fetch loop stays below, unchanged)
```

And add `executeTool?: ToolExecutor` as the last param of `callOpenRouter`'s signature (`:252-258`).

- [ ] **Step 3: Typecheck the edge module**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no type errors.

- [ ] **Step 4: Run the full edge test file**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (unchanged — single-shot tests still green; loop covered by Task 2.1).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts
git commit -m "feat(ai): route OpenRouter through the tool loop when a tool executor is supplied"
```

---

### Task 2.3: Inject the `searchInventory` executor from `generate-draft.ts`

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts:2` (imports), `:102-109` (the `generateAIReply` call)

- [ ] **Step 1: Add the import** (top of `generate-draft.ts`, alongside the other `./` imports)

```typescript
import { searchInventory, type InventorySearchResult } from "./inventory-search.ts";
```

- [ ] **Step 2: Build the executor and pass it to `generateAIReply`**

Replace the `generateAIReply(...)` call (`generate-draft.ts:103-109`) with:

```typescript
  // Tool executor: the AI calls search_inventory; we run it in-process via the RPCs.
  // Accumulate results by code so Phase 4 can attach the offered product's photo.
  const offerCatalog = new Map<string, InventorySearchResult>();
  const executeTool = async (name: string, args: unknown): Promise<unknown> => {
    if (name !== 'search_inventory') return { error: `unknown tool: ${name}` };
    const a = (args ?? {}) as Record<string, unknown>;
    const results = await searchInventory(supabase, {
      query: String(a.query ?? ''),
      category_id: a.category_id ? String(a.category_id) : undefined,
      brand: a.brand ? String(a.brand) : undefined,
      price_min: a.price_min != null ? Number(a.price_min) : undefined,
      price_max: a.price_max != null ? Number(a.price_max) : undefined,
    });
    for (const r of results) offerCatalog.set(r.code, r);
    // Return a compact shape for the model (include order_url so it can paste the link).
    return results.map((r) => ({
      type: r.type, code: r.code, description: r.description,
      grade: r.grade, price: r.price, available_count: r.available_count, order_url: r.order_url,
    }));
  };

  const aiResponse = await generateAIReply(
    provider as AIProvider,
    fullSystemPrompt,
    contextBlock,
    chatMessages,
    latestImages,
    executeTool,
  );
```

> Keep `offerCatalog` in scope — Phase 4 reads it. If you implement only Phases 1–3, it is harmlessly unused (prefix with `void offerCatalog;` to satisfy lint, or leave the Phase 4 attach code as the consumer).

- [ ] **Step 3: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): wire search_inventory tool executor into draft generation"
```

---

## Phase 3 — Behavior: scoped rule + two-path Sales playbook

### Task 3.1: Scope `INVENTORY_RESPONSE_RULE` (mode-aware)

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts:91-98`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```typescript
import { buildEnhancedPrompt as buildEP2 } from './ai-providers.ts';

Deno.test('INVENTORY_RESPONSE_RULE distinguishes specific vs broad asks', () => {
  const out = buildEP2('PERSONA');
  // Specific asks still lead with concrete options / search.
  assertEquals(/specific/i.test(out), true);
  // Broad/category asks must qualify first instead of dumping a product.
  assertEquals(/broad|category/i.test(out), true);
  assertEquals(/qualif/i.test(out), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL on the broad/qualify assertions (current text has no "broad/category" scoping).

- [ ] **Step 3: Replace the constant (`ai-providers.ts:91-98`)**

```typescript
const INVENTORY_RESPONSE_RULE = `
# Response Strategy for Product Inquiries
First decide if the request is SPECIFIC or BROAD:
- SPECIFIC = the customer named a model/code/specs, or sent a photo/screenshot of one listing, or asks "is THIS still available?". 
- BROAD = only a category/intent ("may laptop po ba kayo?", "may phone ba kayo?", "ano meron"), with no recipient, use-case, or budget yet.

For a SPECIFIC ask: confirm availability first. Use the search_inventory tool to find the matching AVAILABLE listing (it may be a different code than the customer quoted), then lead your reply with that concrete option (code, grade, price) and its order_url. Ask at most ONE short follow-up only if needed.

For a BROAD ask: do NOT dump a product and do NOT call search_inventory yet. Follow the active specialist's playbook to qualify first (reassure stock exists, then ask the key questions warmly), then hand off per the playbook.

Keep replies short — 2-4 sentences max. No walls of text.`;
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (and the existing `buildEnhancedPrompt keeps the persona…` test still green).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "fix(ai): scope INVENTORY_RESPONSE_RULE to specific vs broad asks"
```

---

### Task 3.2: Rewrite the Sales playbook (two-path brain)

**Files:**
- Create: `supabase/migrations/20260617160000_sales_specialist_v2_playbook.sql`

Reference the current seed at `supabase/migrations/20260617130000_specialist_playbooks.sql:34-39` for the row shape.

- [ ] **Step 1: Write the migration**

```sql
-- Sales Specialist v2: two-path brain (broad -> qualify + handoff; specific -> search + offer).
UPDATE messaging_specialists
SET playbook = E'You handle product availability, specs, and recommendations. Decide BROAD vs SPECIFIC, then:\n\n'
  || E'## BROAD ask (e.g. "may laptop po ba kayo?", "may phone ba kayo?", "ano meron kayo?") — QUALIFY, then HAND TO A HUMAN. Do NOT call search_inventory and do NOT pick a product.\n'
  || E'1. Reassure stock exists, then ask the key questions warmly bundled into ONE friendly sentence — never a checklist, never bombard. As they answer, briefly summarize what they said (show you listened) and ask the remaining one.\n'
  || E'2. Tailor the questions by category:\n'
  || E'   - Laptops/computers: (1) para kanino / sino gagamit (anak, pamangkin, sarili), (2) saan gagamitin (school, business, gaming), (3) ilang taon na po ang gagamit (the USER''S AGE, not the laptop), (4) magkano budget.\n'
  || E'   - Phones: budget, gamit, brand/storage preference.\n'
  || E'   - Tablets: budget, gamit.\n'
  || E'3. Then set escalation_reason to a one-line summary of the qualified lead (recipient, use, age, budget) so a human can make the recommendation. If the right device TIER clearly exceeds the stated budget (e.g. a college student doing schoolwork needs a real ~¥25,000+ laptop even if they said ¥15,000), note that in escalation_reason — the HUMAN makes the upsell, not you.\n\n'
  || E'## SPECIFIC ask (names a model/code/specs, sends a photo/screenshot of a listing, or "meron pa po ba nito?") — IDENTIFY, SEARCH, OFFER yourself.\n'
  || E'1. Read the item from the message and any image (model, specs, price, or a P-/G-code printed on a live-sell overlay).\n'
  || E'2. Call search_inventory with what you read. The matching AVAILABLE listing may have a DIFFERENT code than the customer quoted (e.g. a sold P-code maps to an in-stock G-code) — offer whatever the search returns as available.\n'
  || E'3. If found: reply warmly that it is available and include the listing''s code, grade, price in yen, and its order_url EXACTLY as returned (do not invent a URL). Put each offered code in the offer_codes array. If it is the last one, say so.\n'
  || E'4. If nothing available matches: say so kindly ("pasensya po, nabenta na po yung ganyan"), offer to find something similar, and set escalation_reason so a human can help.\n\n'
  || E'Selling prices are PUBLIC and safe to share. NEVER reveal buying prices, costs, or suppliers.'
WHERE slug = 'sales';
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: `20260617160000_sales_specialist_v2_playbook` applied.

- [ ] **Step 3: Verify the row updated**

Run:
```bash
psql "$SUPABASE_DB_URL" -c "SELECT left(playbook, 80) AS head, length(playbook) AS len FROM messaging_specialists WHERE slug='sales';"
```
Expected: one row; `head` starts with "You handle product availability…", `len` ~1500+.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617160000_sales_specialist_v2_playbook.sql
git commit -m "feat(ai): rewrite Sales playbook into two-path brain (qualify+handoff / search+offer)"
```

---

### Phase 3 manual smoke (no automated frontend tests exist)

- [ ] **Step 1: Deploy the edge functions to the dev project**

Run: `supabase functions deploy generate-pending-drafts test-ai-reply`
Expected: both deploy successfully.

- [ ] **Step 2: Exercise via `test-ai-reply`** (the project's AI draft test harness)

In the admin Messages "test AI reply" tool (or by invoking the `test-ai-reply` function), send:
- "May laptop po ba kayo?" → draft should reassure + ask the laptop questions in one warm sentence; NO product dump; `escalation_reason` set after answers.
- "Meron pa po kayo nito? G000022" → draft should confirm availability with the `/mine/G000022` link (search tool ran).

Expected: behavior matches; if the model dumps a product on the broad ask, re-check Task 3.1 wording.

---

## Phase 4 — Attach the offered product photo to the draft

### Task 4.1: Add `offer_codes` to the AI response

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts:20-28` (type), `:388-440` (parser), `:262` + the other 3 JSON-instruction strings.
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```typescript
Deno.test('parseAIResponse reads offer_codes array', () => {
  const text = JSON.stringify({
    reply: 'Available po: G000022', confidence: 0.9, intent: 'product_inquiry',
    data_used: ['G000022'], escalation_reason: null, offer_codes: ['G000022'],
  });
  assertEquals(parseAIResponse(text).offer_codes, ['G000022']);
});

Deno.test('parseAIResponse defaults offer_codes to empty array', () => {
  assertEquals(parseAIResponse('{"reply":"hi"}').offer_codes, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `offer_codes` undefined.

- [ ] **Step 3: Implement**

In the `AIResponse` interface (`:20-28`) add:
```typescript
  offer_codes?: string[];
```

In `parseAIResponse`, the successful-parse return block (`:407-414`) add:
```typescript
          offer_codes: Array.isArray(parsed.offer_codes) ? parsed.offer_codes.map(String) : [],
```
and add `offer_codes: []` to BOTH fallback returns (`:424-431` and `:434-440`).

Append to each of the 4 JSON-instruction strings (`:169`, `:208`, `:262`, `:346`), before the final "Respond ONLY…" line:
```
- "offer_codes": array of inventory codes you are offering in this reply (from search_inventory results), e.g. ["G000022"]; empty array if none
```

- [ ] **Step 4: Run to verify it passes**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): add offer_codes to AI response schema + parser"
```

---

### Task 4.2: Copy offered photos into `messaging-attachments` and set draft attachments

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts:140-153` (the draft insert)

The offered product photo lives at a public CDN URL (`offerCatalog.get(code).display_url`). `send-message` only base64s attachments it can download from the `messaging-attachments` bucket (`send-message/index.ts:215-217`), so copy the photo there first.

- [ ] **Step 1: Add a helper above `generateAndSaveDraft`**

```typescript
async function buildOfferAttachments(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  codes: string[],
  catalog: Map<string, InventorySearchResult>,
): Promise<Array<{ file_url: string; filename: string; mime_type: string; size_bytes: number }>> {
  const out: Array<{ file_url: string; filename: string; mime_type: string; size_bytes: number }> = [];
  for (const code of codes.slice(0, 3)) {
    const r = catalog.get(code);
    if (!r?.display_url) continue;
    try {
      const resp = await fetch(r.display_url);
      if (!resp.ok) continue;
      const buf = new Uint8Array(await resp.arrayBuffer());
      const mime = resp.headers.get('content-type') ?? 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const path = `ai-offer/${conversationId}/${code}_${buf.byteLength}.${ext}`;
      const { error } = await supabase.storage
        .from('messaging-attachments')
        .upload(path, buf, { contentType: mime, upsert: true });
      if (error) { console.error('offer photo upload failed (non-fatal):', error); continue; }
      out.push({ file_url: path, filename: `${code}.${ext}`, mime_type: mime, size_bytes: buf.byteLength });
    } catch (err) {
      console.error('offer photo fetch failed (non-fatal):', err);
    }
  }
  return out;
}
```

- [ ] **Step 2: Use it in the draft insert (`generate-draft.ts:140-153`)**

```typescript
  const offerCodes = aiResponse.offer_codes ?? [];
  const offerAttachments = offerCodes.length
    ? await buildOfferAttachments(supabase, conversationId, offerCodes, offerCatalog)
    : [];

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: aiResponse.reply,
    status: 'DRAFT',
    message_type: 'REPLY',
    ai_confidence: aiResponse.confidence,
    attachments: offerAttachments,
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
      offer_codes: offerCodes,
    }),
  });
```

- [ ] **Step 3: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no type errors (`offerCatalog` is now consumed).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): attach offered product photo to the AI draft message"
```

---

### Task 4.3: Render + preserve the draft attachment on the frontend

**Files:**
- Modify: `src/components/messaging/ai-draft-card.tsx` (render preview; pass attachments up on approve)
- Modify: `src/components/messaging/conversation-thread.tsx:384-401` + the `onApproveDraft` type (`:198`)
- Modify: `src/pages/admin/messages.tsx:180-191` (`handleApproveDraft`)

No frontend test runner exists; verify with `npm run lint` + `npx tsc --noEmit` and a manual check.

- [ ] **Step 1: Render the attachment thumbnail in `ai-draft-card.tsx`**

Below the message text (`ai-draft-card.tsx:42-56` area), add a preview when `message.attachments?.length`:

```tsx
{message.attachments && message.attachments.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-2">
    {message.attachments.map((att) => (
      <img
        key={att.file_url}
        src={getAttachmentPublicUrl(att.file_url)}
        alt={att.filename}
        className="h-20 w-20 rounded object-cover border"
      />
    ))}
  </div>
)}
```

Add the import at the top of the file:
```tsx
import { getAttachmentPublicUrl } from '@/services/messaging'
```

- [ ] **Step 2: Change `onApprove` to carry attachments**

In `ai-draft-card.tsx`, update the approve handlers to pass `message.attachments`:
```tsx
onClick={() => { onApprove(editedContent, message.attachments); setIsEditing(false) }}
```
and the non-editing Send button similarly: `onApprove(message.content, message.attachments)`.

Update the card's prop type:
```tsx
onApprove: (content: string, attachments?: MessageAttachment[]) => void
```
(import `MessageAttachment` from `@/lib/types`).

- [ ] **Step 3: Thread attachments through `conversation-thread.tsx`**

Update the `onApproveDraft` prop type (`:198`) and the draft render (`:387-388`):
```tsx
onApproveDraft: (messageId: string, content: string, attachments?: MessageAttachment[]) => void
// ...
onApprove={(content, attachments) => onApproveDraft(msg.id, content, attachments)}
```

- [ ] **Step 4: Pass attachments to `sendMessage` in `messages.tsx`**

Update `handleApproveDraft` (`:180-191`):
```tsx
const handleApproveDraft = useCallback(
  (messageId: string, content: string, attachments?: MessageAttachment[]) => {
    if (!selectedConvId) return
    sendMessage.mutate(
      { conversationId: selectedConvId, content, approveDraftId: messageId, attachments },
      { onError: (err) => toast.error(`Failed to send: ${err.message}`) },
    )
  },
  [selectedConvId, sendMessage],
)
```
Confirm the `sendMessage` mutation hook forwards `attachments` to the service `sendMessage(conversationId, content, approveDraftId, attachments)` (`services/messaging.ts:180`). If the hook's variables type omits `attachments`, add it.

- [ ] **Step 5: Verify build**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual check**

Deploy (`supabase functions deploy generate-pending-drafts test-ai-reply`), trigger a specific-availability draft, and confirm in admin Messages the draft shows the product photo and that approving sends text + photo to the customer.

- [ ] **Step 7: Commit**

```bash
git add src/components/messaging/ai-draft-card.tsx src/components/messaging/conversation-thread.tsx src/pages/admin/messages.tsx
git commit -m "feat(messaging): show + send the AI offer photo on draft approval"
```

---

## Final integration + ship

- [ ] **Step 1: Run all edge tests**

Run: `deno test supabase/functions/_shared/`
Expected: all green.

- [ ] **Step 2: Lint + typecheck frontend**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Bump version + deploy** (per project memory `feedback_versioning` + `feedback_deploy_workflow`)

```bash
# bump package.json version (minor — new capability)
supabase functions deploy generate-pending-drafts test-ai-reply
git add -A && git commit -m "chore: bump version (Sales Specialist v2)"
git push
```

- [ ] **Step 4: Update memory** — mark `project_sales_specialist_v2` shipped; note the search-tool + RPC architecture landed.

---

## Self-Review notes (coverage vs spec)

- Spec §5 Path 1 (broad → qualify + handoff) → Task 3.2 playbook + 3.1 rule. ✅
- Spec §5 Path 2 (specific → identify + search + offer) → Tasks 1.1–1.2 (search), 2.1–2.3 (tool), 3.2 (playbook). ✅
- Spec §6 search tool via in-process RPC, no public endpoint → Phase 1 + 2. ✅
- Spec §7 reuse `/mine/{code}` link, built in code not by the model → `order_url` in Task 1.2, surfaced to the model in 2.3, pasted per 3.2. ✅
- Spec §6 P000825 → G000022 (different available code) → both RPCs searched + "offer whatever search returns as available" instruction (3.2). ✅
- Spec §8 escalation via `escalation_reason`, `always_escalate` stays false → 3.2 (no schema change; reuses existing field). ✅
- Spec §7 photo parity → Phase 4. ✅
- Spec §10.1 RPC (not public endpoint) → Phase 1. ✅
- Phase B (audio) → out of scope, not planned. ✅
