# Messages AI — Plan 2: Context-complete, clarify-don't-guess drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the messaging AI over-assuming by giving it a clean, complete view of the conversation and orders, and a rule that makes it resolve-from-context-then-ask-one-specific-question instead of guessing.

**Architecture:** All changes stay inside the existing Supabase Edge Function draft pipeline (Route A): `_shared/ai-providers.ts`, `_shared/build-ai-context.ts`, `_shared/generate-draft.ts`. Pure transforms (role normalization, response parsing, prompt assembly, order formatting) are unit-tested with `Deno.test`; thin DB-glue (history `SELECT`, order-items `SELECT`) is typechecked on top. No timing changes, no migrations, no new tables/columns.

**Tech Stack:** Deno + TypeScript Supabase Edge Functions, `jsr:@supabase/supabase-js@2`, `jsr:@std/assert@1` for tests.

**Source spec:** `docs/superpowers/specs/2026-06-16-messages-ai-context-clarify-design.md`.

---

## Conventions for this plan

- **Branch off `main` first** (the executor / subagent-driven-development handles this): `git checkout main && git pull && git checkout -b plan2-context-clarify`.
- **Tests:** `deno test supabase/functions/_shared/<file>.test.ts`. Assertions via `jsr:@std/assert@1`, `Deno.test`.
- **Typecheck:** `deno check supabase/functions/_shared/<file>.ts`. **Known gotcha:** the Supabase client is untyped, so `deno check` on `generate-draft.ts` / `build-ai-context.ts` reports **pre-existing** `never`-type errors on `.insert/.update/.select` literals. These exist on `main` and are **NOT regressions** — only flag *new, non-`never`* errors.
- **Commits:** every commit message ends with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (shown via a second `-m`).

## File Structure (Plan 2)

- **Modify** `supabase/functions/_shared/ai-providers.ts` — `normalizeRole()` (pure, fixes staff/assistant consolidation), `CLARIFY_BEFORE_ASSUMING_RULE` + `buildEnhancedPrompt()`, `needs_clarification` across the four JSON contracts + `AIResponse` + exported `parseAIResponse()`.
- **Modify** `supabase/functions/_shared/ai-providers.test.ts` — tests for `normalizeRole`, `parseAIResponse`, `buildEnhancedPrompt`.
- **Modify** `supabase/functions/_shared/build-ai-context.ts` — SENT-only dialogue history, `formatOrderItem()` (pure) + richer order-items `SELECT`, `mostRecentOrderCode()` (pure) + marker in `formatContextForPrompt()`.
- **Modify** `supabase/functions/_shared/build-ai-context.test.ts` — tests for `formatOrderItem`, `mostRecentOrderCode`, and the most-recent marker in `formatContextForPrompt`.
- **Modify** `supabase/functions/_shared/generate-draft.ts` — persist `needs_clarification` into the draft's `ai_context_summary`.

---

## Task 1: Merge staff + AI replies as one "our side" (`normalizeRole`)

Today `consolidateMessages` merges by raw role string, so `'staff'` and `'assistant'` (which both later map to the API `assistant` turn) are treated as different sides — producing a fragmented/non-alternating view of our replies. Normalize role to `'customer' | 'assistant'` *before* consolidating.

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/ai-providers.test.ts`:

```ts
import { normalizeRole, consolidateForTest } from './ai-providers.ts';

Deno.test('normalizeRole maps staff and assistant to one assistant side', () => {
  assertEquals(normalizeRole('customer'), 'customer');
  assertEquals(normalizeRole('assistant'), 'assistant');
  assertEquals(normalizeRole('staff'), 'assistant');
  assertEquals(normalizeRole('anything-else'), 'assistant');
});

Deno.test('consolidate merges a staff reply and an AI reply into one assistant turn', () => {
  const out = consolidateForTest([
    { role: 'customer', content: 'hi' },
    { role: 'staff', content: 'hello from staff' },
    { role: 'assistant', content: 'and from AI' },
    { role: 'customer', content: 'ok thanks' },
  ]);
  assertEquals(out, [
    { role: 'customer', content: 'hi' },
    { role: 'assistant', content: 'hello from staff\nand from AI' },
    { role: 'customer', content: 'ok thanks' },
  ]);
});

Deno.test('consolidate preserves alternation and merges a customer burst', () => {
  const out = consolidateForTest([
    { role: 'customer', content: 'a' },
    { role: 'customer', content: 'b' },
    { role: 'staff', content: 'reply' },
    { role: 'customer', content: 'c' },
  ]);
  assertEquals(out, [
    { role: 'customer', content: 'a\nb' },
    { role: 'assistant', content: 'reply' },
    { role: 'customer', content: 'c' },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `normalizeRole` / `consolidateForTest` not exported.

- [ ] **Step 3: Implement `normalizeRole` and normalize inside `consolidateMessages`**

In `supabase/functions/_shared/ai-providers.ts`, replace the existing `consolidateMessages` function (the block starting `function consolidateMessages(messages: ChatMessage[]): ChatMessage[] {` and ending at its closing `}`):

```ts
function consolidateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];

  const result: ChatMessage[] = [];
  for (const m of messages) {
    const role = normalizeRole(m.role);
    const prev = result[result.length - 1];
    if (prev && prev.role === role) {
      prev.content += '\n' + m.content;
    } else {
      result.push({ role, content: m.content });
    }
  }
  return result;
}

// Collapse message roles to the two sides an LLM chat API understands.
// Customer messages are the "user" side; everything we send back
// (AI 'assistant' drafts AND human 'staff' replies) is the "assistant" side.
export function normalizeRole(role: string): 'customer' | 'assistant' {
  return role === 'customer' ? 'customer' : 'assistant';
}

// Test-only re-export so the pure consolidation logic can be unit-tested
// without going through a provider network call.
export function consolidateForTest(messages: ChatMessage[]): ChatMessage[] {
  return consolidateMessages(messages);
}
```

> The four provider mappings already route any non-`'customer'` role to the assistant turn (`m.role === 'customer' ? 'user' : 'assistant'`), so normalizing inside `consolidateMessages` fixes all four providers at once with no other call-site changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (existing `extractUsage` tests + 3 new tests).

- [ ] **Step 5: Typecheck**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): merge staff and AI replies into one assistant side for context" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `needs_clarification` in the output contract

Add a boolean signal so we can tell when the AI is asking to clarify vs answering (telemetry now; feeds Plan 5 auto-send suppression later). `parseAIResponse` must be exported to be unit-tested.

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/ai-providers.test.ts`:

```ts
import { parseAIResponse } from './ai-providers.ts';

Deno.test('parseAIResponse reads needs_clarification = true', () => {
  const text = JSON.stringify({
    reply: 'Order ORD000123 po ba ito?',
    confidence: 0.8,
    intent: 'order_status',
    data_used: ['order:ORD000123'],
    escalation_reason: null,
    needs_clarification: true,
  });
  assertEquals(parseAIResponse(text).needs_clarification, true);
});

Deno.test('parseAIResponse defaults needs_clarification to false when absent', () => {
  const text = JSON.stringify({ reply: 'Available po ang iPhone 13.', confidence: 0.9 });
  assertEquals(parseAIResponse(text).needs_clarification, false);
});

Deno.test('parseAIResponse defaults needs_clarification to false on non-JSON reply', () => {
  assertEquals(parseAIResponse('just a plain sentence reply').needs_clarification, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `parseAIResponse` not exported (and `needs_clarification` missing).

- [ ] **Step 3: Add `needs_clarification` to the `AIResponse` interface**

In `supabase/functions/_shared/ai-providers.ts`, replace the `AIResponse` interface:

```ts
export interface AIResponse {
  reply: string;
  confidence: number;
  intent: string;
  data_used: string[];
  escalation_reason: string | null;
  usage?: TokenUsage;
}
```

with:

```ts
export interface AIResponse {
  reply: string;
  confidence: number;
  intent: string;
  data_used: string[];
  escalation_reason: string | null;
  needs_clarification?: boolean;
  usage?: TokenUsage;
}
```

- [ ] **Step 4: Export `parseAIResponse` and populate `needs_clarification` in all three return paths**

In the same file, change the parser signature. Replace:

```ts
function parseAIResponse(text: string): AIResponse {
```

with:

```ts
export function parseAIResponse(text: string): AIResponse {
```

Then, in the **structured** return branch, replace:

```ts
        return {
          reply: String(parsed.reply),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
          intent: String(parsed.intent ?? 'unknown'),
          data_used: Array.isArray(parsed.data_used) ? parsed.data_used.map(String) : [],
          escalation_reason: parsed.escalation_reason ? String(parsed.escalation_reason) : null,
        };
```

with:

```ts
        return {
          reply: String(parsed.reply),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
          intent: String(parsed.intent ?? 'unknown'),
          data_used: Array.isArray(parsed.data_used) ? parsed.data_used.map(String) : [],
          escalation_reason: parsed.escalation_reason ? String(parsed.escalation_reason) : null,
          needs_clarification: parsed.needs_clarification === true,
        };
```

In the **plain-text fallback** branch, replace:

```ts
    return {
      reply: text.trim(),
      confidence: 0.5,
      intent: 'general',
      data_used: [],
      escalation_reason: null,
    };
```

with:

```ts
    return {
      reply: text.trim(),
      confidence: 0.5,
      intent: 'general',
      data_used: [],
      escalation_reason: null,
      needs_clarification: false,
    };
```

In the **last-resort** return, replace:

```ts
  return {
    reply: text,
    confidence: 0.3,
    intent: 'unknown',
    data_used: [],
    escalation_reason: 'AI response could not be parsed as structured JSON',
  };
```

with:

```ts
  return {
    reply: text,
    confidence: 0.3,
    intent: 'unknown',
    data_used: [],
    escalation_reason: 'AI response could not be parsed as structured JSON',
    needs_clarification: false,
  };
```

- [ ] **Step 5: Add `needs_clarification` to all four JSON contract strings**

The four provider call sites (`callClaude`, `callOpenAI`, `callOpenRouter`, `callGemini`) each embed an **identical** contract string. Replace every occurrence of:

```
- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.
```

with:

```
- "escalation_reason": null if no escalation needed, otherwise a short reason string\n- "needs_clarification": true if your reply is a question asking the customer to clarify their request (instead of answering it), otherwise false\n\nRespond ONLY with the JSON object, no markdown fences.
```

> This substring is identical at all four sites — use a replace-all so every provider's contract gains the field. Verify with `grep -c 'needs_clarification' supabase/functions/_shared/ai-providers.ts` → expect **8** (interface ×1 + parser return branches ×3 + contracts ×4).

- [ ] **Step 6: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (all prior tests + 3 new).

- [ ] **Step 7: Typecheck**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): add needs_clarification signal to draft output contract" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `CLARIFY_BEFORE_ASSUMING_RULE` + testable prompt assembly

Add the behavioral rule and inject it into every messaging prompt via a pure, testable `buildEnhancedPrompt()`.

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/ai-providers.test.ts`:

```ts
import { buildEnhancedPrompt } from './ai-providers.ts';

Deno.test('buildEnhancedPrompt keeps the persona and appends both rule blocks', () => {
  const out = buildEnhancedPrompt('PERSONA-PROMPT');
  // persona retained
  assertEquals(out.includes('PERSONA-PROMPT'), true);
  // existing inventory rule retained
  assertEquals(out.includes('Response Strategy for Product Inquiries'), true);
  // new clarify rule appended
  assertEquals(out.includes('Resolve before assuming'), true);
  assertEquals(out.includes('never re-ask'), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `buildEnhancedPrompt` not exported.

- [ ] **Step 3: Add the rule constant and `buildEnhancedPrompt`**

In `supabase/functions/_shared/ai-providers.ts`, immediately **after** the `INVENTORY_RESPONSE_RULE` constant (the block ending with ``No walls of text.`;``), add:

```ts
const CLARIFY_BEFORE_ASSUMING_RULE = `
# Resolve before assuming — then ask ONE specific question
1. The customer's most recent messages may be a burst — treat them as ONE request and answer them together.
2. Read the FULL conversation above before replying. NEVER re-ask something already asked or answered earlier in the thread.
3. For vague references ("my order", "what I asked", "ano na nangyari sa binili/tinanong ko"), FIRST resolve them from the Customer / Orders context. If exactly one obvious order or topic matches (e.g. the most recent order), use it directly.
4. Only if it is genuinely ambiguous (multiple candidates, or nothing in context) ask ONE short, SPECIFIC clarifying question that cites the concrete detail you have — e.g. "Order ORD000123 (iPhone 13) po ba ang tinatanong nyo?" — never a generic "ano pong tanong nyo?".
5. If the latest message is a bare screenshot or a fragment with no clear ask, briefly say what you see and ask one specific question. Do NOT guess.
6. NEVER invent facts (price, stock, order status, tracking) that are not present in the context above.`;

// Assemble the full system prompt sent to every messaging provider:
// persona/guardrails + the inventory strategy + the clarify-don't-guess rule.
export function buildEnhancedPrompt(systemPrompt: string): string {
  return `${systemPrompt}\n\n${INVENTORY_RESPONSE_RULE}\n\n${CLARIFY_BEFORE_ASSUMING_RULE}`;
}
```

- [ ] **Step 4: Use `buildEnhancedPrompt` in `generateAIReply`**

In the same file, inside `generateAIReply`, replace:

```ts
  // Inject inventory response strategy into every prompt
  const enhancedPrompt = `${systemPrompt}\n\n${INVENTORY_RESPONSE_RULE}`;
```

with:

```ts
  // Inject inventory response strategy + clarify-don't-guess rule into every prompt
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (all prior tests + 1 new).

- [ ] **Step 6: Typecheck**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): add clarify-before-assuming rule to messaging prompts" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Drop unsent DRAFTs from the dialogue history

A rejected/stale AI draft (`status='DRAFT'`) currently appears in history as `[assistant]`, indistinguishable from a sent reply — the model believes it already answered. Build dialogue history from `SENT` messages only. This is thin DB-glue (one-line `SELECT` change), typechecked rather than unit-tested.

**Files:**
- Modify: `supabase/functions/_shared/build-ai-context.ts`

- [ ] **Step 1: Restrict `getRecentMessages` to SENT messages**

In `supabase/functions/_shared/build-ai-context.ts`, inside `getRecentMessages`, replace:

```ts
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .in('status', ['SENT', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(20);
```

with:

```ts
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    // SENT only: a rejected/stale DRAFT must not look like a reply we actually sent,
    // or the model thinks it already answered and re-asks / contradicts itself.
    .eq('status', 'SENT')
    .order('created_at', { ascending: false })
    .limit(20);
```

- [ ] **Step 2: Typecheck**

Run: `deno check supabase/functions/_shared/build-ai-context.ts`
Expected: no new errors (pre-existing `never`-type `.select` warnings are not regressions).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/build-ai-context.ts
git commit -m "fix(ai): exclude unsent drafts from AI conversation history" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Human-readable order items + most-recent-order marker

So vague references like "ano na nangyari sa binili ko" resolve to a concrete order. Add two pure helpers (tested) and wire them into the order fetchers + formatter (typechecked).

**Files:**
- Modify: `supabase/functions/_shared/build-ai-context.ts`
- Test: `supabase/functions/_shared/build-ai-context.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/build-ai-context.test.ts`:

```ts
import {
  formatOrderItem,
  mostRecentOrderCode,
  formatContextForPrompt,
} from './build-ai-context.ts';

Deno.test('formatOrderItem renders brand + model + P-code when model is known', () => {
  assertEquals(
    formatOrderItem({ item_code: 'P000417', product_models: { brand: 'Apple', model_name: 'iPhone 13' } }),
    'Apple iPhone 13 (P000417)',
  );
});

Deno.test('formatOrderItem falls back to the P-code when model is missing', () => {
  assertEquals(
    formatOrderItem({ item_code: 'P000417', product_models: null }),
    'P000417',
  );
});

Deno.test('mostRecentOrderCode picks the newest order across active + recent', () => {
  const active = [{ order_code: 'ORD000200', created_at: '2026-06-10T00:00:00Z' }];
  const recent = [
    { order_code: 'ORD000100', created_at: '2026-06-01T00:00:00Z' },
    { order_code: 'ORD000200', created_at: '2026-06-10T00:00:00Z' },
  ];
  assertEquals(mostRecentOrderCode(active, recent), 'ORD000200');
});

Deno.test('mostRecentOrderCode returns null when there are no orders', () => {
  assertEquals(mostRecentOrderCode([], []), null);
});

Deno.test('formatContextForPrompt marks the most recent order', () => {
  const ctx = {
    customer: null,
    activeOrders: [{
      order_code: 'ORD000200', order_status: 'SHIPPED', total_price: 1000,
      tracking_number: null, yamato_status: null, shipped_date: null, delivery_date: null,
      delivery_issue_flag: false, created_at: '2026-06-10T00:00:00Z',
      items: ['Apple iPhone 13 (P000417)'],
    }],
    recentOrders: [{
      order_code: 'ORD000100', order_status: 'DELIVERED', total_price: 500,
      tracking_number: null, yamato_status: null, shipped_date: null, delivery_date: null,
      delivery_issue_flag: false, created_at: '2026-06-01T00:00:00Z', items: [],
    }],
    kaitoriRequests: [], recentMessages: [], inventorySummary: [],
    availableItems: [], accessorySummary: [],
  } as unknown as Parameters<typeof formatContextForPrompt>[0];

  const out = formatContextForPrompt(ctx);
  assertEquals(out.includes('ORD000200'), true);
  assertEquals(out.includes('← most recent'), true);
  // The item name (not just the P-code) is present
  assertEquals(out.includes('Apple iPhone 13 (P000417)'), true);
  // The older order is NOT marked
  assertEquals(out.includes('ORD000100: DELIVERED'), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/build-ai-context.test.ts`
Expected: FAIL — `formatOrderItem` / `mostRecentOrderCode` not exported (and no marker yet).

- [ ] **Step 3: Add the two pure helpers**

In `supabase/functions/_shared/build-ai-context.ts`, add these exported helpers immediately **above** `export function formatContextForPrompt(` (just under the `// ---------- Summary formatters for AI prompt ----------` comment):

```ts
// Render a single order line item as a human-readable string for the prompt.
// Prefers "Brand Model (P-code)"; falls back to the bare P-code when the
// product model is unknown.
export function formatOrderItem(
  item: { item_code: string; product_models: { brand: string; model_name: string } | null },
): string {
  const pm = item.product_models;
  if (pm && (pm.brand || pm.model_name)) {
    return `${pm.brand ?? ''} ${pm.model_name ?? ''} (${item.item_code})`.replace(/\s+/g, ' ').trim();
  }
  return item.item_code;
}

// Return the order_code of the single most recent order across active + recent,
// so the formatter can mark it (resolves "my order" / "binili ko"). Null if none.
export function mostRecentOrderCode(
  activeOrders: { order_code: string; created_at: string }[],
  recentOrders: { order_code: string; created_at: string }[],
): string | null {
  const all = [...activeOrders, ...recentOrders];
  if (all.length === 0) return null;
  let best = all[0];
  for (const o of all) {
    if (o.created_at > best.created_at) best = o;
  }
  return best.order_code;
}
```

- [ ] **Step 4: Mark the most-recent order in `formatContextForPrompt`**

In the same function, at the very top of `formatContextForPrompt` (right after `const sections: string[] = [];`), add:

```ts
  const recentCode = mostRecentOrderCode(context.activeOrders, context.recentOrders);
  const mark = (code: string) => (code === recentCode ? ' ← most recent' : '');
```

Then, in the **Active Orders** block, replace:

```ts
      let line = `- ${o.order_code}: status=${o.order_status}, total=¥${o.total_price}`;
```

with:

```ts
      let line = `- ${o.order_code}${mark(o.order_code)}: status=${o.order_status}, total=¥${o.total_price}`;
```

And in the **Recent Orders** block, replace:

```ts
    const lines = context.recentOrders.map(
      (o) => `- ${o.order_code}: ${o.order_status}, ¥${o.total_price}, ${o.created_at.slice(0, 10)}`
    );
```

with:

```ts
    const lines = context.recentOrders.map(
      (o) => `- ${o.order_code}${mark(o.order_code)}: ${o.order_status}, ¥${o.total_price}, ${o.created_at.slice(0, 10)}`
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/build-ai-context.test.ts`
Expected: PASS (existing image-selector tests + 5 new).

- [ ] **Step 6: Enrich the order-items `SELECT` to carry product names (DB-glue)**

In `getActiveOrders`, replace the `.select(...)`:

```ts
    .select(`
      order_code, order_status, total_price, tracking_number,
      yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at,
      order_items(items(item_code))
    `)
```

with:

```ts
    .select(`
      order_code, order_status, total_price, tracking_number,
      yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at,
      order_items(items(item_code, product_models(brand, model_name)))
    `)
```

Then replace the `items:` mapping in `getActiveOrders`:

```ts
    items: ((o.order_items as Array<{ items: { item_code: string } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => oi.items!.item_code),
```

with:

```ts
    items: ((o.order_items as Array<{ items: { item_code: string; product_models: { brand: string; model_name: string } | null } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => formatOrderItem(oi.items!)),
```

- [ ] **Step 7: Give Recent Orders the same item names**

`getRecentOrders` currently fetches no items, so `OrderSummary.items` is always `[]` there. Add items. Replace its `.select(...)`:

```ts
    .select('order_code, order_status, total_price, tracking_number, yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at')
```

with:

```ts
    .select('order_code, order_status, total_price, tracking_number, yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at, order_items(items(item_code, product_models(brand, model_name)))')
```

Then, in `getRecentOrders`, locate the `return data.map(...)` block and replace its closing — specifically replace:

```ts
    created_at: o.created_at as string,
```

(within `getRecentOrders` only — it is the last mapped field there, followed by `}));`) so the mapped object ends with an `items` field. Replace:

```ts
    created_at: o.created_at as string,
  }));
```

with:

```ts
    created_at: o.created_at as string,
    items: ((o.order_items as Array<{ items: { item_code: string; product_models: { brand: string; model_name: string } | null } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => formatOrderItem(oi.items!)),
  }));
```

> Note: the `## Recent Orders` formatter line doesn't print `items`, so this has no formatter effect today — but it makes `recentOrders[].items` correct and available, matching `activeOrders`. (Active Orders already prints items via the existing `if (o.items.length > 0)` line.)

- [ ] **Step 8: Typecheck**

Run: `deno check supabase/functions/_shared/build-ai-context.ts`
Expected: no new errors (pre-existing `never`-type `.select`/map warnings are not regressions).

- [ ] **Step 9: Re-run the test file (no regressions)**

Run: `deno test supabase/functions/_shared/build-ai-context.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/build-ai-context.ts supabase/functions/_shared/build-ai-context.test.ts
git commit -m "feat(ai): show order item names and mark the most recent order in AI context" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Persist `needs_clarification` on the draft

Record the new signal on the saved DRAFT so it's visible in telemetry and ready for Plan 5.

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Add `needs_clarification` to the draft's context summary**

In `supabase/functions/_shared/generate-draft.ts`, in the `// 7. Save draft message` insert, replace:

```ts
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
    }),
```

with:

```ts
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
    }),
```

- [ ] **Step 2: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no new errors (pre-existing `never`-type `.insert` warnings are not regressions).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): record needs_clarification on generated drafts" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Full-suite green + deploy

**Files:** none (verification + deploy).

- [ ] **Step 1: Run all shared tests**

Run: `deno test supabase/functions/_shared/`
Expected: PASS — all suites green (`ai-cost`, `ai-providers`, `ai-vision`, `build-ai-context`).

- [ ] **Step 2: Typecheck the touched modules**

Run: `deno check supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/build-ai-context.ts supabase/functions/_shared/generate-draft.ts`
Expected: only the pre-existing `never`-type errors on Supabase client literals in `build-ai-context.ts` / `generate-draft.ts` (present on `main`). No new non-`never` errors in `ai-providers.ts`.

- [ ] **Step 3: Deploy the affected edge functions**

The shared files are bundled into the functions that import them. Deploy the draft-producing functions:

Run: `supabase functions deploy generate-pending-drafts missive-webhook test-ai-reply`
Expected: deploys succeed. (No migration to push — Plan 2 adds none.)

- [ ] **Step 4: Smoke-check end-to-end (manual)**

Send a Messenger test where the customer references "binili ko" without an order code, on a customer that has exactly one recent order. Wait the silence window, then read the generated DRAFT in Admin → Messages. Confirm: it cites the concrete order (e.g. "Order ORD000xxx (iPhone 13)") rather than guessing or asking a generic question; and a bare-screenshot test yields a specific clarifying question, not an assumption.

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- §4.1 keep 120s timing (no code) → documented; no task needed (intentional). ✓
- §4.2 C1 SENT-only history → Task 4. ✓
- §4.2 C2 staff+AI one side (`normalizeRole`) → Task 1. ✓
- §4.2 C3 order item names + most-recent marker → Task 5. ✓
- §4.3 `CLARIFY_BEFORE_ASSUMING_RULE` → Task 3. ✓
- §4.4 `needs_clarification` (contract + parse + persist) → Tasks 2 & 6. ✓
- §5 testing strategy → tests in Tasks 1, 2, 3, 5; typecheck-only for IO glue in Tasks 4, 5(DB), 6. ✓
- §6 out-of-scope (no early trigger, no migration, Plans 3–5) → respected; no tasks. ✓

**2. Placeholder scan:** No "TBD"/"similar to Task N"/"add error handling". All code shown in full. ✓

**3. Type consistency:**
- `normalizeRole`/`consolidateForTest` exported in Task 1, imported by tests in Task 1. ✓
- `parseAIResponse` exported in Task 2; `AIResponse.needs_clarification?: boolean` consumed in Task 6 via `aiResponse.needs_clarification ?? false`. ✓
- `buildEnhancedPrompt` defined Task 3, used in `generateAIReply` same task; references `INVENTORY_RESPONSE_RULE` (pre-existing) + `CLARIFY_BEFORE_ASSUMING_RULE` (added same task). ✓
- `formatOrderItem` input shape `{ item_code, product_models: { brand, model_name } | null }` matches the enriched `order_items(items(item_code, product_models(brand, model_name)))` select mapping in Tasks 5.6 / 5.7. ✓
- `mostRecentOrderCode(activeOrders, recentOrders)` params (`{ order_code, created_at }[]`) satisfied by `OrderSummary` (has both fields). ✓
- Contract-count check (`grep -c needs_clarification` → 8) guards against missing a provider site. ✓
