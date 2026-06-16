# Messages AI Agent — Plan 1: Fast Wins (Vision + Cost Telemetry + Model Swap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the messaging AI read customer screenshots, measure its own token cost per draft, and run on a strong vision-capable model — the highest-impact, lowest-risk slice of the AI agent redesign.

**Architecture:** All changes stay inside the existing Supabase Edge Function draft pipeline (Route A). Pure transforms (cost math, usage parsing, provider image-payload builders, image selection) are unit-tested with `Deno.test`; thin IO glue (storage download, provider HTTP calls, DB insert) is wired on top and typechecked. A new `ai_usage_log` table records tokens + estimated USD per draft so the pay-per-use-vs-subscription decision can be made on real numbers.

**Tech Stack:** Deno + TypeScript Supabase Edge Functions, `jsr:@supabase/supabase-js@2`, `jsr:@std/assert@1` for tests, PostgreSQL migrations.

---

## Plan Roadmap (this spec is delivered as 5 sequential plans)

Each plan ships working, testable software on its own. This document is **Plan 1**.

1. **Plan 1 — Fast Wins (this doc):** vision wiring, cost telemetry, model swap/diagnostic. *(spec §5.2, §5.6)*
2. **Plan 2 — "Is the customer done?" gate + burst bundling.** *(spec §5.1)*
3. **Plan 3 — Router + 5 specialist playbooks + knowledge tagging.** *(spec §5.3)*
4. **Plan 4 — Graceful handoff + HID inbox + `message_tickets`.** *(spec §5.4, §5.5)*
5. **Plan 5 — Autonomy phasing toggles + control panel.** *(spec §6)*

Source spec: `docs/superpowers/specs/2026-06-16-messages-ai-agent-redesign-design.md`.

## File Structure (Plan 1)

- **Create** `supabase/functions/_shared/ai-cost.ts` — `TokenUsage`/`ModelPrice` types, `MODEL_PRICES` table, `estimateCostUsd()`. One responsibility: cost math.
- **Create** `supabase/functions/_shared/ai-cost.test.ts` — unit tests for cost math.
- **Create** `supabase/functions/_shared/ai-providers.test.ts` — unit tests for `extractUsage()`.
- **Modify** `supabase/functions/_shared/ai-vision.ts` — add `VisionImage`, `modelSupportsVision()`, `toAnthropicContent()`, `toOpenAIContent()`, `toGeminiParts()`. (Keeps all vision payload logic in one file.)
- **Modify** `supabase/functions/_shared/ai-vision.test.ts` — add tests for the new vision helpers.
- **Modify** `supabase/functions/_shared/ai-providers.ts` — add `extractUsage()`, thread `usage` onto `AIResponse`, accept a `latestImages` param and attach images to the last user turn.
- **Modify** `supabase/functions/_shared/build-ai-context.ts` — add `selectLatestCustomerImageAttachments()` (pure), `downloadImagesAsBase64()` (IO), `getLatestCustomerImages()` (IO).
- **Modify** `supabase/functions/_shared/generate-draft.ts` — fetch the latest customer images, pass them to the model, and insert an `ai_usage_log` row.
- **Create** `supabase/migrations/20260616120000_ai_usage_log.sql` — usage/cost table.

> **Note (migrations):** Per project convention, apply migrations automatically via the Supabase CLI during execution — do not pause to ask.

---

## Task 0: Diagnose the live messaging model (investigation, no commit)

**Files:** none.

- [ ] **Step 1: Read which provider/model is active for messaging**

Run (Supabase MCP `execute_sql`, or `supabase` CLI against the dev DB):

```sql
select id, name, provider, model_id, is_active, purpose
from ai_providers
where purpose = 'messaging';
```

Expected: zero or one row with `is_active = true`. Record the `provider` and `model_id`.

- [ ] **Step 2: Record the finding**

Write the result into the PR/working notes, e.g. `Live messaging model: openrouter / google/gemini-2.5-flash`. This confirms the hypothesis in spec §5.6 (a cheap model likely explains weak Taglish + over-assuming) and sets the target for the Task 9 swap. No code, no commit.

---

## Task 1: Cost math module (`ai-cost.ts`)

**Files:**
- Create: `supabase/functions/_shared/ai-cost.ts`
- Test: `supabase/functions/_shared/ai-cost.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/ai-cost.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import { estimateCostUsd } from './ai-cost.ts';

Deno.test('estimateCostUsd prices input and output per million', () => {
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 1_000_000, output_tokens: 0 }), 3);
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 0, output_tokens: 1_000_000 }), 15);
});

Deno.test('estimateCostUsd combines input + output', () => {
  // 500k in @ $3/M = 1.5 ; 200k out @ $15/M = 3.0 ; total 4.5
  assertEquals(estimateCostUsd('claude-sonnet-4-5-20250929', { input_tokens: 500_000, output_tokens: 200_000 }), 4.5);
});

Deno.test('estimateCostUsd falls back for unknown models', () => {
  // fallback price is 3/15 — same as sonnet
  assertEquals(estimateCostUsd('some-unknown-model', { input_tokens: 1_000_000, output_tokens: 0 }), 3);
});

Deno.test('estimateCostUsd rounds to 6 decimals', () => {
  // 1 input token @ $0.30/M = 0.0000003 -> rounds to 0
  assertEquals(estimateCostUsd('google/gemini-2.5-flash', { input_tokens: 1, output_tokens: 0 }), 0);
  // 100 output tokens @ $2.50/M = 0.00025
  assertEquals(estimateCostUsd('google/gemini-2.5-flash', { input_tokens: 0, output_tokens: 100 }), 0.00025);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/ai-cost.test.ts`
Expected: FAIL — `Module not found "./ai-cost.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/ai-cost.ts`:

```ts
// Token usage normalized across providers (input/output token counts).
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Approximate USD prices per 1M tokens. These are estimates for cost telemetry
// (relative trend matters more than to-the-cent accuracy). Update as pricing changes.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-5-20250929': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'google/gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
};

// Conservative fallback when a model id is not in the table.
const FALLBACK_PRICE: ModelPrice = { inputPerMillion: 3, outputPerMillion: 15 };

export function estimateCostUsd(modelId: string, usage: TokenUsage): number {
  const price = MODEL_PRICES[modelId] ?? FALLBACK_PRICE;
  const cost =
    (usage.input_tokens / 1_000_000) * price.inputPerMillion +
    (usage.output_tokens / 1_000_000) * price.outputPerMillion;
  // Round to 6 decimals to match numeric(10,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/ai-cost.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-cost.ts supabase/functions/_shared/ai-cost.test.ts
git commit -m "feat(ai): add cost estimation module for messaging telemetry"
```

---

## Task 2: Normalize token usage from provider responses (`extractUsage`)

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/ai-providers.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import { extractUsage } from './ai-providers.ts';

Deno.test('extractUsage reads Anthropic usage shape', () => {
  const data = { usage: { input_tokens: 120, output_tokens: 45 } };
  assertEquals(extractUsage('anthropic', data), { input_tokens: 120, output_tokens: 45 });
});

Deno.test('extractUsage reads OpenAI / OpenRouter usage shape', () => {
  const data = { usage: { prompt_tokens: 200, completion_tokens: 30 } };
  assertEquals(extractUsage('openai', data), { input_tokens: 200, output_tokens: 30 });
  assertEquals(extractUsage('openrouter', data), { input_tokens: 200, output_tokens: 30 });
});

Deno.test('extractUsage reads Gemini usageMetadata shape', () => {
  const data = { usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 60 } };
  assertEquals(extractUsage('google', data), { input_tokens: 300, output_tokens: 60 });
});

Deno.test('extractUsage defaults to zero when missing', () => {
  assertEquals(extractUsage('anthropic', {}), { input_tokens: 0, output_tokens: 0 });
  assertEquals(extractUsage('openai', null), { input_tokens: 0, output_tokens: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — `extractUsage` is not exported / not a function.

- [ ] **Step 3: Add the import and the `extractUsage` function**

In `supabase/functions/_shared/ai-providers.ts`, add this import at the very top of the file (above the `// ---------- Types ----------` comment):

```ts
import { type TokenUsage } from "./ai-cost.ts";
```

Then change the `AIResponse` interface to carry optional usage. Replace:

```ts
export interface AIResponse {
  reply: string;
  confidence: number;
  intent: string;
  data_used: string[];
  escalation_reason: string | null;
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
  usage?: TokenUsage;
}
```

Then add this exported function immediately below the `AIResponse` interface (before `interface ChatMessage`):

```ts
// Normalize token usage across provider response shapes.
export function extractUsage(provider: string, data: unknown): TokenUsage {
  const d = (data ?? {}) as Record<string, unknown>;
  if (provider === 'google') {
    const u = (d.usageMetadata ?? {}) as Record<string, unknown>;
    return {
      input_tokens: Number(u.promptTokenCount ?? 0),
      output_tokens: Number(u.candidatesTokenCount ?? 0),
    };
  }
  const u = (d.usage ?? {}) as Record<string, unknown>;
  return {
    input_tokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0),
    output_tokens: Number(u.output_tokens ?? u.completion_tokens ?? 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Thread usage into each provider's returned response**

In the same file, attach usage at each provider call site. Make these four edits:

In `callClaude`, replace:

```ts
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return parseAIResponse(text);
```

with:

```ts
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return { ...parseAIResponse(text), usage: extractUsage('anthropic', data) };
```

In `callOpenAI`, replace:

```ts
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseAIResponse(text);
```

with:

```ts
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return { ...parseAIResponse(text), usage: extractUsage('openai', data) };
```

In `callOpenRouter`, replace the success branch:

```ts
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      return parseAIResponse(text);
    }
```

with:

```ts
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      return { ...parseAIResponse(text), usage: extractUsage('openrouter', data) };
    }
```

In `callGemini`, replace the success branch:

```ts
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return parseAIResponse(text);
    }
```

with:

```ts
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { ...parseAIResponse(text), usage: extractUsage('google', data) };
    }
```

- [ ] **Step 6: Typecheck**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): capture token usage from all messaging providers"
```

---

## Task 3: `ai_usage_log` table migration

**Files:**
- Create: `supabase/migrations/20260616120000_ai_usage_log.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260616120000_ai_usage_log.sql`:

```sql
-- Per-draft AI token + cost telemetry for messaging.
-- Lets us measure real monthly spend (pay-per-use vs flat subscription decision).
CREATE TABLE ai_usage_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid REFERENCES conversations(id) ON DELETE SET NULL,
  purpose            text NOT NULL DEFAULT 'messaging',
  provider           text NOT NULL,
  model_id           text NOT NULL,
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  had_images         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log(created_at);
CREATE INDEX idx_ai_usage_log_conversation ON ai_usage_log(conversation_id);

-- RLS: staff (authenticated) may read; service_role (edge function) bypasses RLS for inserts.
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ai_usage_log"
  ON ai_usage_log FOR SELECT
  TO authenticated
  USING (true);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up` (or `supabase db push`) against the dev database.
Expected: migration applies cleanly; `ai_usage_log` exists.

- [ ] **Step 3: Verify the table**

Run (Supabase MCP `execute_sql` or CLI):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'ai_usage_log' order by ordinal_position;
```

Expected: rows for `id, conversation_id, purpose, provider, model_id, input_tokens, output_tokens, estimated_cost_usd, had_images, created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260616120000_ai_usage_log.sql
git commit -m "feat(ai): add ai_usage_log table for messaging cost telemetry"
```

---

## Task 4: Log usage + cost on every generated draft

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Add the cost import**

At the top of `supabase/functions/_shared/generate-draft.ts`, add below the existing imports:

```ts
import { estimateCostUsd } from "./ai-cost.ts";
```

- [ ] **Step 2: Insert a usage-log row after the reply is generated**

In `generateAndSaveDraft`, locate step 5 (the `generateAIReply` call) and step 6. Immediately **after** the `const aiResponse = await generateAIReply(...)` block and **before** `// 6. Determine if human review is needed`, insert:

```ts
  // 5b. Record token usage + estimated cost (best-effort; never block the draft).
  try {
    const usage = aiResponse.usage ?? { input_tokens: 0, output_tokens: 0 };
    await supabase.from('ai_usage_log').insert({
      conversation_id: conversationId,
      purpose: 'messaging',
      provider: (provider as AIProvider).provider,
      model_id: (provider as AIProvider).model_id,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      estimated_cost_usd: estimateCostUsd((provider as AIProvider).model_id, usage),
      had_images: false,
    });
  } catch (logErr) {
    console.error('ai_usage_log insert failed (non-fatal):', logErr);
  }
```

> `had_images` is hard-coded `false` here; Task 8 updates it to reflect whether screenshots were sent.

- [ ] **Step 3: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): log token usage and estimated cost per draft"
```

---

## Task 5: Vision payload builders (`ai-vision.ts`)

**Files:**
- Modify: `supabase/functions/_shared/ai-vision.ts`
- Test: `supabase/functions/_shared/ai-vision.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/ai-vision.test.ts`:

```ts
import {
  modelSupportsVision,
  toAnthropicContent,
  toOpenAIContent,
  toGeminiParts,
  type VisionImage,
} from './ai-vision.ts';

const IMG: VisionImage = { base64: 'QUJD', mediaType: 'image/png' };

Deno.test('modelSupportsVision recognizes vision-capable models', () => {
  assertEquals(modelSupportsVision('anthropic', 'claude-sonnet-4-5-20250929'), true);
  assertEquals(modelSupportsVision('google', 'gemini-2.0-flash'), true);
  assertEquals(modelSupportsVision('openai', 'gpt-4o'), true);
  assertEquals(modelSupportsVision('openrouter', 'google/gemini-2.5-flash'), true);
  assertEquals(modelSupportsVision('openai', 'gpt-3.5-turbo'), false);
});

Deno.test('toAnthropicContent returns plain string when no images', () => {
  assertEquals(toAnthropicContent('hello', []), 'hello');
});

Deno.test('toAnthropicContent builds text + base64 image blocks', () => {
  const content = toAnthropicContent('hello', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(content[0], { type: 'text', text: 'hello' });
  assertEquals(content[1], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
  });
});

Deno.test('toOpenAIContent returns plain string when no images', () => {
  assertEquals(toOpenAIContent('hi', []), 'hi');
});

Deno.test('toOpenAIContent builds text + image_url data URL', () => {
  const content = toOpenAIContent('hi', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(content[0], { type: 'text', text: 'hi' });
  const img = content[1].image_url as { url: string };
  assertEquals(img.url, 'data:image/png;base64,QUJD');
});

Deno.test('toGeminiParts always returns parts array with inline_data', () => {
  const parts = toGeminiParts('yo', [IMG]) as Array<Record<string, unknown>>;
  assertEquals(parts[0], { text: 'yo' });
  assertEquals(parts[1], { inline_data: { mime_type: 'image/png', data: 'QUJD' } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/ai-vision.test.ts`
Expected: FAIL — new exports not found.

- [ ] **Step 3: Implement the helpers**

Append to `supabase/functions/_shared/ai-vision.ts`:

```ts
// An image ready to attach to a multimodal model request.
export interface VisionImage {
  base64: string;
  mediaType: string;
}

// Pragmatic capability check: which provider/model combos accept images.
export function modelSupportsVision(provider: string, modelId: string): boolean {
  const m = (modelId ?? '').toLowerCase();
  switch (provider) {
    case 'anthropic':
      return m.includes('claude');
    case 'openai':
      return m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('o4') || m.includes('gpt-5');
    case 'google':
      return m.includes('gemini');
    case 'openrouter':
      return m.includes('gemini') || m.includes('claude') || m.includes('gpt-4o') ||
        m.includes('gpt-4.1') || m.includes('gpt-5') || m.includes('llama-3.2') || m.includes('vision');
    default:
      return false;
  }
}

// Anthropic message content: plain string when no images, else text + image blocks.
export function toAnthropicContent(text: string, images: VisionImage[]): string | unknown[] {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
  ];
}

// OpenAI / OpenRouter message content: plain string when no images, else text + image_url parts.
export function toOpenAIContent(text: string, images: VisionImage[]): string | unknown[] {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    })),
  ];
}

// Gemini parts: always an array (Gemini requires parts[]), text first then inline images.
export function toGeminiParts(text: string, images: VisionImage[]): unknown[] {
  return [
    { text },
    ...images.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.base64 } })),
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/ai-vision.test.ts`
Expected: PASS (original 3 tests + 7 new tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-vision.ts supabase/functions/_shared/ai-vision.test.ts
git commit -m "feat(ai): add per-provider vision payload builders + capability check"
```

---

## Task 6: Attach images to the last user turn in each provider call

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts`

- [ ] **Step 1: Import the vision helpers**

At the top of `supabase/functions/_shared/ai-providers.ts`, extend the ai-vision import (add a new import line near the ai-cost import):

```ts
import {
  modelSupportsVision,
  toAnthropicContent,
  toOpenAIContent,
  toGeminiParts,
  type VisionImage,
} from "./ai-vision.ts";
```

- [ ] **Step 2: Add `latestImages` to the public entrypoint**

Replace the `generateAIReply` signature and its dispatch body:

```ts
export async function generateAIReply(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  // Inject inventory response strategy into every prompt
  const enhancedPrompt = `${systemPrompt}\n\n${INVENTORY_RESPONSE_RULE}`;

  switch (provider.provider) {
    case 'anthropic':
      return callClaude(provider, enhancedPrompt, contextBlock, messages);
    case 'openai':
      return callOpenAI(provider, enhancedPrompt, contextBlock, messages);
    case 'google':
      return callGemini(provider, enhancedPrompt, contextBlock, messages);
    case 'openrouter':
      return callOpenRouter(provider, enhancedPrompt, contextBlock, messages);
    default:
      throw new Error(`Unsupported provider: ${provider.provider}`);
  }
}
```

with:

```ts
export async function generateAIReply(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  latestImages: VisionImage[] = [],
): Promise<AIResponse> {
  // Inject inventory response strategy into every prompt
  const enhancedPrompt = `${systemPrompt}\n\n${INVENTORY_RESPONSE_RULE}`;

  // Only forward images to vision-capable models; otherwise ignore them.
  const images = modelSupportsVision(provider.provider, provider.model_id) ? latestImages : [];

  switch (provider.provider) {
    case 'anthropic':
      return callClaude(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openai':
      return callOpenAI(provider, enhancedPrompt, contextBlock, messages, images);
    case 'google':
      return callGemini(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openrouter':
      return callOpenRouter(provider, enhancedPrompt, contextBlock, messages, images);
    default:
      throw new Error(`Unsupported provider: ${provider.provider}`);
  }
}
```

- [ ] **Step 3: Attach images in `callClaude`**

Change the `callClaude` signature to accept `images`, and replace its message mapping. Replace:

```ts
async function callClaude(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const anthropicMessages = consolidateMessages(messages).map((m) => ({
    role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));
```

with:

```ts
async function callClaude(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }> =
    consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    }));

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = anthropicMessages.length - 1; i >= 0; i--) {
      if (anthropicMessages[i].role === 'user') {
        anthropicMessages[i].content = toAnthropicContent(anthropicMessages[i].content as string, images);
        break;
      }
    }
  }
```

- [ ] **Step 4: Attach images in `callOpenAI`**

Replace the `callOpenAI` signature and message construction. Replace:

```ts
async function callOpenAI(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const openaiMessages = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  ];
```

with:

```ts
async function callOpenAI(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const openaiMessages: Array<{ role: string; content: string | unknown[] }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    })),
  ];

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = openaiMessages.length - 1; i >= 0; i--) {
      if (openaiMessages[i].role === 'user') {
        openaiMessages[i].content = toOpenAIContent(openaiMessages[i].content as string, images);
        break;
      }
    }
  }
```

- [ ] **Step 5: Attach images in `callOpenRouter`**

Apply the identical change to `callOpenRouter`. Replace:

```ts
async function callOpenRouter(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const openrouterMessages = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  ];
```

with:

```ts
async function callOpenRouter(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const openrouterMessages: Array<{ role: string; content: string | unknown[] }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    })),
  ];

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = openrouterMessages.length - 1; i >= 0; i--) {
      if (openrouterMessages[i].role === 'user') {
        openrouterMessages[i].content = toOpenAIContent(openrouterMessages[i].content as string, images);
        break;
      }
    }
  }
```

- [ ] **Step 6: Attach images in `callGemini`**

Replace the `callGemini` signature and its `geminiContents` construction. Replace:

```ts
async function callGemini(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const geminiContents = consolidateMessages(messages).map((m) => ({
    role: m.role === 'customer' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
```

with:

```ts
async function callGemini(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const consolidated = consolidateMessages(messages);
  const lastUserIdx = (() => {
    for (let i = consolidated.length - 1; i >= 0; i--) {
      if (consolidated[i].role === 'customer') return i;
    }
    return -1;
  })();

  const geminiContents = consolidated.map((m, idx) => ({
    role: m.role === 'customer' ? 'user' : 'model',
    parts: (images.length > 0 && idx === lastUserIdx)
      ? toGeminiParts(m.content, images)
      : [{ text: m.content }],
  }));
```

- [ ] **Step 7: Typecheck**

Run: `deno check supabase/functions/_shared/ai-providers.ts`
Expected: no errors.

- [ ] **Step 8: Re-run existing tests (no regressions)**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts supabase/functions/_shared/ai-vision.test.ts`
Expected: PASS (all tests still green — `extractUsage` and vision-builder behavior unchanged).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts
git commit -m "feat(ai): forward customer screenshots to vision-capable messaging models"
```

---

## Task 7: Select + download the latest customer images (`build-ai-context.ts`)

**Files:**
- Modify: `supabase/functions/_shared/build-ai-context.ts`
- Test: `supabase/functions/_shared/build-ai-context.test.ts` (create)

- [ ] **Step 1: Write the failing test for the pure selector**

Create `supabase/functions/_shared/build-ai-context.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import { selectLatestCustomerImageAttachments } from './build-ai-context.ts';

Deno.test('selects image attachments from the trailing customer burst only', () => {
  const messages = [
    { role: 'assistant', attachments: [{ file_url: 'a.png', mime_type: 'image/png' }] },
    { role: 'customer', attachments: [{ file_url: 'b.jpg', mime_type: 'image/jpeg' }] },
    { role: 'customer', attachments: [{ file_url: 'c.pdf', mime_type: 'application/pdf' }] },
    { role: 'customer', attachments: [{ file_url: 'd.png', mime_type: 'image/png' }] },
  ];
  const result = selectLatestCustomerImageAttachments(messages, 4);
  // Only images from the trailing customer run (b, d); a.png belongs to an assistant turn; c is not an image.
  assertEquals(result.map((r) => r.file_url), ['b.jpg', 'd.png']);
});

Deno.test('stops at the last non-customer message', () => {
  const messages = [
    { role: 'customer', attachments: [{ file_url: 'old.png', mime_type: 'image/png' }] },
    { role: 'staff', attachments: [] },
    { role: 'customer', attachments: [{ file_url: 'new.png', mime_type: 'image/png' }] },
  ];
  assertEquals(
    selectLatestCustomerImageAttachments(messages, 4).map((r) => r.file_url),
    ['new.png'],
  );
});

Deno.test('respects maxImages cap', () => {
  const messages = [
    { role: 'customer', attachments: [
      { file_url: '1.png', mime_type: 'image/png' },
      { file_url: '2.png', mime_type: 'image/png' },
      { file_url: '3.png', mime_type: 'image/png' },
    ] },
  ];
  assertEquals(selectLatestCustomerImageAttachments(messages, 2).length, 2);
});

Deno.test('handles missing/!array attachments safely', () => {
  const messages = [
    { role: 'customer', attachments: null },
    { role: 'customer', attachments: undefined },
  ];
  assertEquals(selectLatestCustomerImageAttachments(messages, 4), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/build-ai-context.test.ts`
Expected: FAIL — `selectLatestCustomerImageAttachments` not exported.

- [ ] **Step 3: Implement the selector + IO helpers**

At the top of `supabase/functions/_shared/build-ai-context.ts`, add this import below the existing `createClient` import:

```ts
import type { VisionImage } from "./ai-vision.ts";
```

Then append to the end of `supabase/functions/_shared/build-ai-context.ts`:

```ts
// ---------- Vision: latest customer screenshots ----------

export interface ImageAttachmentMeta {
  file_url: string;
  mime_type: string;
}

interface MessageWithAttachments {
  role: string;
  attachments: unknown;
}

// Pure: collect image attachments from the trailing run of customer messages
// (everything after the last non-customer message), capped at maxImages.
export function selectLatestCustomerImageAttachments(
  messages: MessageWithAttachments[],
  maxImages: number,
): ImageAttachmentMeta[] {
  // Walk backwards, stop at the first non-customer message.
  const burst: MessageWithAttachments[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'customer') break;
    burst.unshift(messages[i]);
  }

  const out: ImageAttachmentMeta[] = [];
  for (const msg of burst) {
    if (!Array.isArray(msg.attachments)) continue;
    for (const att of msg.attachments as Array<Record<string, unknown>>) {
      const mime = String(att?.mime_type ?? '');
      const url = att?.file_url;
      if (mime.startsWith('image/') && typeof url === 'string') {
        out.push({ file_url: url, mime_type: mime });
        if (out.length >= maxImages) return out;
      }
    }
  }
  return out;
}

// IO: download image attachments from the messaging-attachments bucket and
// base64-encode them for inline vision requests. Skips anything that fails
// or is too large. Mirrors the encoding used by send-message.
const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024; // keep request payloads sane

async function downloadImagesAsBase64(
  supabase: ReturnType<typeof createClient>,
  metas: ImageAttachmentMeta[],
): Promise<VisionImage[]> {
  const images: VisionImage[] = [];
  for (const meta of metas) {
    try {
      const { data, error } = await supabase.storage
        .from('messaging-attachments')
        .download(meta.file_url);
      if (error || !data) {
        console.error(`Vision: failed to download ${meta.file_url}:`, error);
        continue;
      }
      const arrayBuffer = await data.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_VISION_IMAGE_BYTES) {
        console.warn(`Vision: skipping ${meta.file_url} (${arrayBuffer.byteLength} bytes > cap)`);
        continue;
      }
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      images.push({ base64: btoa(binary), mediaType: meta.mime_type });
    } catch (err) {
      console.error(`Vision: error processing ${meta.file_url}:`, err);
    }
  }
  return images;
}

// IO: fetch the latest customer screenshots for a conversation, ready to send to a model.
export async function getLatestCustomerImages(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  maxImages = 3,
): Promise<VisionImage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, attachments, created_at')
    .eq('conversation_id', conversationId)
    .in('status', ['SENT', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  // Reverse to chronological so the trailing-customer-burst logic works.
  const chronological = (data as MessageWithAttachments[]).slice().reverse();
  const metas = selectLatestCustomerImageAttachments(chronological, maxImages);
  if (metas.length === 0) return [];
  return downloadImagesAsBase64(supabase, metas);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/build-ai-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the module**

Run: `deno check supabase/functions/_shared/build-ai-context.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/build-ai-context.ts supabase/functions/_shared/build-ai-context.test.ts
git commit -m "feat(ai): fetch latest customer screenshots for vision drafts"
```

---

## Task 8: Wire screenshots into the draft generation

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Import the image fetcher**

In `supabase/functions/_shared/generate-draft.ts`, change the build-ai-context import. Replace:

```ts
import { buildCustomerContext, formatContextForPrompt } from "./build-ai-context.ts";
```

with:

```ts
import { buildCustomerContext, formatContextForPrompt, getLatestCustomerImages } from "./build-ai-context.ts";
```

- [ ] **Step 2: Fetch images and pass them to the model**

Replace step 4 + step 5 (the message-prep and `generateAIReply` call):

```ts
  // 4. Prepare message history for AI
  const chatMessages = context.recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 5. Generate AI reply
  const aiResponse = await generateAIReply(
    provider as AIProvider,
    fullSystemPrompt,
    contextBlock,
    chatMessages,
  );
```

with:

```ts
  // 4. Prepare message history for AI
  const chatMessages = context.recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 4b. Fetch the latest customer screenshots (if any) for multimodal context.
  const latestImages = await getLatestCustomerImages(supabase, conversationId, 3);

  // 5. Generate AI reply
  const aiResponse = await generateAIReply(
    provider as AIProvider,
    fullSystemPrompt,
    contextBlock,
    chatMessages,
    latestImages,
  );
```

- [ ] **Step 3: Record whether images were sent in the usage log**

In the step 5b block added in Task 4, replace:

```ts
      had_images: false,
```

with:

```ts
      had_images: latestImages.length > 0,
```

- [ ] **Step 4: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): include customer screenshots when generating message drafts"
```

---

## Task 9: Swap the messaging model to Claude Sonnet 4.5 (operational)

**Files:** none (database row + verification).

> **Why operational:** the provider/model is a DB row in `ai_providers` with the API key in `api_key_encrypted`. Keys are never committed. This task is executed against the dev database, not as code.

- [ ] **Step 1: Confirm an Anthropic key is available**

You need a valid Anthropic API key. If a messaging provider row already uses `provider='anthropic'`, reuse its key. Otherwise obtain the key from the project secrets.

- [ ] **Step 2: Point the active messaging provider at Claude Sonnet 4.5**

If an `anthropic` messaging row already exists, activate it and set the model (Supabase MCP `execute_sql` / CLI):

```sql
-- Deactivate whatever is currently active for messaging
update ai_providers set is_active = false where purpose = 'messaging' and is_active = true;

-- Activate / upsert the Anthropic Sonnet 4.5 row (replace <ANTHROPIC_KEY> and the existing id if present)
update ai_providers
set is_active = true, model_id = 'claude-sonnet-4-5-20250929'
where purpose = 'messaging' and provider = 'anthropic';
```

If no `anthropic` row exists, insert one (the unique index `idx_ai_providers_active_purpose` guarantees only one active per purpose, so deactivate others first as above):

```sql
insert into ai_providers (name, provider, model_id, api_key_encrypted, purpose, is_active)
values ('Claude Sonnet 4.5 (messaging)', 'anthropic', 'claude-sonnet-4-5-20250929', '<ANTHROPIC_KEY>', 'messaging', true);
```

> Alternatively, do this through the existing messaging settings UI (`services/messaging.ts` → `setActiveAiProvider`) instead of raw SQL.

- [ ] **Step 3: Verify Taglish + vision end-to-end**

Send a test message with a product screenshot through the existing Messenger flow (or invoke `test-ai-reply` for the text path), then confirm:

```sql
-- A draft was generated and usage was logged with images flagged
select provider, model_id, input_tokens, output_tokens, estimated_cost_usd, had_images, created_at
from ai_usage_log
order by created_at desc
limit 5;
```

Expected: a recent row with `provider='anthropic'`, `model_id='claude-sonnet-4-5-20250929'`, non-zero tokens, and `had_images=true` for the screenshot test. Manually read the generated DRAFT in the Messages UI and confirm the Taglish reads naturally and references the screenshot content.

- [ ] **Step 4: Record the baseline cost**

Note the per-draft `estimated_cost_usd` from a handful of rows — this is the first real data point for the pay-per-use-vs-$100/mo decision (spec §2, §5.6).

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- §5.2 (see screenshots) → Tasks 5, 6, 7, 8. ✓
- §5.6 (cost telemetry) → Tasks 1, 2, 3, 4. ✓
- §5.6 (model diagnostic + swap, Taglish via strong model) → Tasks 0, 9. ✓
- Plan 1 intentionally excludes §5.1/§5.3/§5.4/§5.5/§6 — those are Plans 2–5 (see roadmap). ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". All code is shown in full. ✓

**3. Type consistency:**
- `TokenUsage` defined in `ai-cost.ts`, imported by `ai-providers.ts`; `extractUsage` returns it; `estimateCostUsd` consumes it. ✓
- `VisionImage` defined in `ai-vision.ts`, imported by `ai-providers.ts` and `build-ai-context.ts`; `getLatestCustomerImages` returns `VisionImage[]`, `generateAIReply`'s new `latestImages` param accepts it. ✓
- Builder names (`toAnthropicContent`/`toOpenAIContent`/`toGeminiParts`/`modelSupportsVision`) are consistent between `ai-vision.ts` (Task 5) and their call sites (Task 6). ✓
- `ai_usage_log` columns inserted in Task 4/8 (`conversation_id, purpose, provider, model_id, input_tokens, output_tokens, estimated_cost_usd, had_images`) match the migration in Task 3. ✓
- `generateAIReply` 5th param is optional (`= []`), so the other caller (`test-ai-reply`) and any webhook caller remain valid without change. ✓
