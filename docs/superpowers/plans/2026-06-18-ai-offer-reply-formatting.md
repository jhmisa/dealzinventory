# AI Offer Reply Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI product-availability replies match the manual agent format — a clean emoji spec block (🏷/📝/🏅/💴/📸) with full canonical specs and a bare clickable link — assembled deterministically by code so it is identical whether sent manually or auto-sent.

**Architecture:** The AI writes only the natural intro/outro lines plus a literal `{{OFFER}}` token. Two new pure Deno modules — a ported description builder and an offer-block assembler — turn structured inventory data into the emoji block, splice it into the reply at draft-generation time (so it's persisted into `messages.content`), and are called by both the real draft path and the Test Playground so previews equal what the customer receives.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), `jsr:@std/assert` for tests, OpenRouter messaging model.

**Spec:** `docs/superpowers/specs/2026-06-18-ai-offer-reply-formatting-design.md`

---

## File Structure

- **Create** `supabase/functions/_shared/item-description.ts` — Deno-pure port of the canonical description builder (`buildShortDescription`, `getItemDescription`, `getSpecFieldLabel`, `SPEC_FIELD_LABELS`). Single responsibility: turn item/model spec fields into the same string the frontend shows.
- **Create** `supabase/functions/_shared/item-description.test.ts` — golden-value parity tests.
- **Create** `supabase/functions/_shared/offer-reply.ts` — `formatOfferBlock` + `assembleOfferReply`. Single responsibility: render and splice the emoji offer block (no markdown).
- **Create** `supabase/functions/_shared/offer-reply.test.ts` — unit tests.
- **Modify** `supabase/functions/_shared/inventory-search.ts` — expand `RawItemRow` with spec fields (optional) + `category_description_fields`; build `description` via the ported builder.
- **Modify** `supabase/functions/_shared/inventory-search.test.ts` — add a rich-description test.
- **Modify** `supabase/functions/_shared/ai-providers.ts` — rewrite `INVENTORY_RESPONSE_RULE` to token-based, no-markdown output.
- **Modify** `supabase/functions/_shared/generate-draft.ts` — call `assembleOfferReply` before saving the draft.
- **Modify** `supabase/functions/test-ai-reply/index.ts` — call `assembleOfferReply` before returning to the playground.

---

## Task 1: Port the description builder to the edge runtime

**Files:**
- Create: `supabase/functions/_shared/item-description.ts`
- Test: `supabase/functions/_shared/item-description.test.ts`

This is a faithful port of `src/lib/utils.ts` (`buildShortDescription`, `getItemDescription`) + `src/lib/constants.ts` (`AVAILABLE_SPEC_FIELDS`, `getSpecFieldLabel`). Keep it pure — no imports beyond TypeScript itself.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/item-description.test.ts`:

```typescript
import { assertEquals } from 'jsr:@std/assert@1';
import { getItemDescription, buildShortDescription } from './item-description.ts';

// Golden values: these strings must match what the frontend builder (src/lib/utils.ts
// + src/lib/constants.ts) produces today. If the frontend builder changes, update both.

Deno.test('getItemDescription: category description_fields path (laptop)', () => {
  const item = {
    brand: 'Toshiba', model_name: 'Dynabook K50', ram_gb: '8GB', storage_gb: '128GB',
    cpu: 'Intel Celeron N4020 1.1GHz', gpu: 'Intel UHD Graphics 600',
    screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
  };
  const fields = ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'];
  assertEquals(
    getItemDescription(item, null, fields),
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
});

Deno.test('getItemDescription: no description_fields falls back to slash concat', () => {
  const item = { brand: 'Oppo', model_name: 'A5 5G', cpu: null, ram_gb: '4GB', storage_gb: '128GB', screen_size: 6.56 };
  assertEquals(getItemDescription(item, null, null), 'Oppo A5 5G / 4GB / 128GB / 6.56"');
});

Deno.test('getItemDescription: pulls missing fields from productModel', () => {
  const item = { ram_gb: '16GB' };
  const pm = { brand: 'Dell', model_name: 'XPS 13', storage_gb: '512GB' };
  const fields = ['brand', 'model_name', 'ram_gb', 'storage_gb'];
  assertEquals(getItemDescription(item, pm, fields), 'Dell XPS 13 16GB 512GB');
});

Deno.test('buildShortDescription: boolean field renders its label when true', () => {
  assertEquals(
    buildShortDescription({ model_name: 'iPhone 13', is_unlocked: true }, ['model_name', 'is_unlocked']),
    'iPhone 13 Unlocked',
  );
});

Deno.test('buildShortDescription: skips null/empty/false values', () => {
  assertEquals(
    buildShortDescription({ model_name: 'iPhone 13', color: null, is_unlocked: false }, ['model_name', 'color', 'is_unlocked']),
    'iPhone 13',
  );
});

Deno.test('getItemDescription: empty input falls back to supplier_description', () => {
  assertEquals(getItemDescription({ supplier_description: 'Used handset, no box' }, null, null), 'Used handset, no box');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/item-description.test.ts`
Expected: FAIL — `Module not found "./item-description.ts"`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/item-description.ts`:

```typescript
// Deno-pure port of the canonical item-description builder used by the frontend
// (src/lib/utils.ts buildShortDescription/getItemDescription + src/lib/constants.ts
// AVAILABLE_SPEC_FIELDS/getSpecFieldLabel). Kept identical so AI replies and the manual
// Messages-tab paste render the SAME description string. Parity is guarded by
// item-description.test.ts golden values — update both together if the frontend changes.

const SPEC_FIELD_LABELS: Record<string, string> = {
  brand: 'Brand', model_name: 'Model Name', model_number: 'Model Number', part_number: 'Part Number',
  color: 'Color', cpu: 'CPU', ram_gb: 'Memory', storage_gb: 'Storage', os_family: 'OS Family',
  gpu: 'GPU', carrier: 'Carrier', is_unlocked: 'Unlocked', keyboard_layout: 'Keyboard Layout',
  screen_size: 'Screen Size', has_touchscreen: 'Touchscreen', has_thunderbolt: 'Thunderbolt',
  supports_stylus: 'Stylus Support', has_cellular: 'Cellular', imei_slot_count: 'IMEI Slot Count',
  chipset: 'Chipset', ports: 'Ports', year: 'Year', other_features: 'Other Features',
  has_camera: 'Camera', has_bluetooth: 'Bluetooth', battery_health_pct: 'Battery Health (%)',
  condition_notes: 'Condition Notes',
};

export function getSpecFieldLabel(key: string): string {
  return SPEC_FIELD_LABELS[key] ?? key;
}

export function buildShortDescription(
  values: Record<string, unknown>,
  descriptionFields: string[],
): string {
  return descriptionFields
    .map((key) => {
      const val = values[key];
      if (val == null || val === '' || val === false) return null;
      if (key === 'ram_gb' && val) return String(val);
      if (key === 'storage_gb' && val) return String(val);
      if (key === 'screen_size' && val) return `${val}"`;
      if (key === 'battery_health_pct' && val) return `Battery ${val}%`;
      if (key === 'condition_notes' && val) return String(val);
      if (typeof val === 'boolean') return val ? getSpecFieldLabel(key) : null;
      return String(val);
    })
    .filter(Boolean)
    .join(' ');
}

export function getItemDescription(
  item: Record<string, unknown>,
  productModel?: Record<string, unknown> | null,
  descriptionFields?: string[] | null,
): string {
  if (descriptionFields && descriptionFields.length > 0) {
    const resolvedValues: Record<string, unknown> = {};
    for (const key of descriptionFields) {
      resolvedValues[key] = item[key] ?? productModel?.[key];
    }
    return buildShortDescription(resolvedValues, descriptionFields) || (item.supplier_description as string) || '';
  }
  const brand = item.brand ?? productModel?.brand;
  const modelName = item.model_name ?? productModel?.model_name;
  const fullModel = brand && modelName ? `${brand} ${modelName}` : null;
  const screenSize = item.screen_size ?? productModel?.screen_size;
  const parts = [
    fullModel,
    item.cpu,
    item.ram_gb,
    item.storage_gb,
    screenSize ? `${screenSize}"` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : ((item.supplier_description as string) || '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/item-description.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/item-description.ts supabase/functions/_shared/item-description.test.ts
git commit -m "feat(ai): port canonical item-description builder to edge runtime"
```

---

## Task 2: Use rich descriptions in inventory-search

**Files:**
- Modify: `supabase/functions/_shared/inventory-search.ts:3` (RawItemRow), `:85` (mapInventoryResults)
- Test: `supabase/functions/_shared/inventory-search.test.ts`

The shared RPC `search_available_inventory` already returns the spec fields and
`category_description_fields`; we stop discarding them and build the description with the
ported builder. New fields are **optional** so existing test fixtures still compile.

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/_shared/inventory-search.test.ts`:

```typescript
Deno.test('mapInventoryResults builds rich description from category description_fields', () => {
  const items: RawItemRow[] = [{
    id: 'i9', item_code: 'P001471', condition_grade: 'B', selling_price: 15900, discount: 0,
    brand: 'Toshiba', model_name: 'Dynabook K50',
    ram_gb: '8GB', storage_gb: '128GB', cpu: 'Intel Celeron N4020 1.1GHz',
    gpu: 'Intel UHD Graphics 600', screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
    category_description_fields: ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'],
    first_item_display_url: 'https://cdn/k50.jpg', first_item_thumb_url: null,
    hero_media_url: null, first_product_media_url: null, condition_notes: null,
  }];
  const out = mapInventoryResults(items, [], 'https://dealzinventory.vercel.app');
  const item = out.find((r) => r.code === 'P001471')!;
  assertEquals(
    item.description,
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts`
Expected: FAIL — `description` is `'Toshiba Dynabook K50'` (current brand+model concat), not the rich string. (TypeScript will also flag unknown properties until Step 3 widens `RawItemRow`.)

- [ ] **Step 3: Widen RawItemRow and use the builder**

In `supabase/functions/_shared/inventory-search.ts`, add the import at the top (after the existing `createClient` import):

```typescript
import { getItemDescription } from "./item-description.ts";
```

Replace the `RawItemRow` interface (currently at line 3) with:

```typescript
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
  // Spec fields returned by search_available_inventory — used to build the rich,
  // category-aware description identical to the frontend (Admin Items / Messages tab).
  model_number?: string | null;
  storage_gb?: string | null;
  ram_gb?: string | null;
  cpu?: string | null;
  gpu?: string | null;
  screen_size?: number | null;
  color?: string | null;
  os_family?: string | null;
  year?: number | null;
  battery_health_pct?: number | null;
  is_unlocked?: boolean | null;
  has_touchscreen?: boolean | null;
  supplier_description?: string | null;
  category_description_fields?: string[] | null;
}
```

In `mapInventoryResults`, replace the item `desc`/`description` lines (the block that currently does `const desc = [r.brand, r.model_name].filter(Boolean).join(' ') || '—';` and `description: r.condition_notes ? \`${desc} — ${r.condition_notes}\` : desc,`) with:

```typescript
    const desc = getItemDescription(
      r as unknown as Record<string, unknown>,
      null,
      r.category_description_fields ?? null,
    ) || [r.brand, r.model_name].filter(Boolean).join(' ') || '—';
```

and set the result's `description` to:

```typescript
      description: r.condition_notes ? `${desc} — ${r.condition_notes}` : desc,
```

(The condition_notes suffix behavior is preserved.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/inventory-search.test.ts supabase/functions/_shared/item-description.test.ts`
Expected: PASS — all tests green (3 original + 1 new inventory test + 6 description tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/inventory-search.ts supabase/functions/_shared/inventory-search.test.ts
git commit -m "feat(ai): rich category-aware descriptions in inventory search results"
```

---

## Task 3: Offer-block assembler

**Files:**
- Create: `supabase/functions/_shared/offer-reply.ts`
- Test: `supabase/functions/_shared/offer-reply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/offer-reply.test.ts`:

```typescript
import { assertEquals } from 'jsr:@std/assert@1';
import { formatOfferBlock, assembleOfferReply } from './offer-reply.ts';
import type { InventorySearchResult } from './inventory-search.ts';

function res(over: Partial<InventorySearchResult>): InventorySearchResult {
  return {
    type: 'item', code: 'P001443', description: 'Oppo A5 5G 4GB 128GB Aurora Green',
    grade: 'S', price: 18900, available_count: 1, thumbnail_url: null, display_url: null,
    order_url: 'https://dealzinventory.vercel.app/mine/P001443', ...over,
  };
}

Deno.test('formatOfferBlock renders the full emoji block', () => {
  assertEquals(formatOfferBlock(res({})),
    '🏷 P001443\n' +
    '📝 Oppo A5 5G 4GB 128GB Aurora Green\n' +
    '🏅 Rank S\n' +
    '💴 ¥18,900\n' +
    '📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443');
});

Deno.test('formatOfferBlock omits grade and price lines when null', () => {
  assertEquals(formatOfferBlock(res({ grade: null, price: null })),
    '🏷 P001443\n' +
    '📝 Oppo A5 5G 4GB 128GB Aurora Green\n' +
    '📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443');
});

Deno.test('formatOfferBlock formats price with thousands separators', () => {
  assertEquals(formatOfferBlock(res({ price: 1299000 })).includes('💴 ¥1,299,000'), true);
});

Deno.test('assembleOfferReply replaces the {{OFFER}} token in place', () => {
  const catalog = new Map([['P001443', res({})]]);
  const reply = 'Yes, available pa po! 😊\n\n{{OFFER}}\n\nLet me know po!';
  assertEquals(assembleOfferReply(reply, ['P001443'], catalog),
    'Yes, available pa po! 😊\n\n' +
    formatOfferBlock(res({})) +
    '\n\nLet me know po!');
});

Deno.test('assembleOfferReply stacks multiple offers separated by a blank line', () => {
  const a = res({ code: 'P001443' });
  const b = res({ code: 'P001444', description: 'Oppo A5 5G Black', order_url: 'https://dealzinventory.vercel.app/mine/P001444' });
  const catalog = new Map([['P001443', a], ['P001444', b]]);
  assertEquals(assembleOfferReply('{{OFFER}}', ['P001443', 'P001444'], catalog),
    `${formatOfferBlock(a)}\n\n${formatOfferBlock(b)}`);
});

Deno.test('assembleOfferReply appends block at end when token missing but codes present', () => {
  const catalog = new Map([['P001443', res({})]]);
  assertEquals(assembleOfferReply('Yes available po!', ['P001443'], catalog),
    `Yes available po!\n\n${formatOfferBlock(res({}))}`);
});

Deno.test('assembleOfferReply strips a stray token when there are no codes', () => {
  assertEquals(assembleOfferReply('Hi po! {{OFFER}} salamat!', [], new Map()),
    'Hi po! salamat!');
});

Deno.test('assembleOfferReply passes plain replies through unchanged', () => {
  assertEquals(assembleOfferReply('Salamat po!', [], new Map()), 'Salamat po!');
});

Deno.test('assembleOfferReply ignores codes missing from the catalog', () => {
  assertEquals(assembleOfferReply('{{OFFER}}', ['P999999'], new Map()), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/offer-reply.test.ts`
Expected: FAIL — `Module not found "./offer-reply.ts"`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/offer-reply.ts`:

```typescript
import type { InventorySearchResult } from "./inventory-search.ts";

const OFFER_TOKEN = "{{OFFER}}";
const MAX_OFFERS = 3; // matches the offered-photo attachment cap

/**
 * Render one offered item as the emoji spec block agents use manually. Plain text only —
 * NO markdown — so Facebook Messenger shows it cleanly and the bare URL stays clickable.
 * Grade/price lines are omitted when their data is null.
 */
export function formatOfferBlock(r: InventorySearchResult): string {
  const lines = [
    `🏷 ${r.code}`,
    `📝 ${r.description}`,
  ];
  if (r.grade) lines.push(`🏅 Rank ${r.grade}`);
  if (r.price != null) lines.push(`💴 ¥${r.price.toLocaleString("en-US")}`);
  lines.push(`📸 Buy Now & View Photos: ${r.order_url}`);
  return lines.join("\n");
}

/**
 * Splice the offered item block(s) into the model's reply. The model is instructed to write
 * intro + the {{OFFER}} token + outro; we replace the token with the assembled block(s).
 * Fallbacks: if the model forgot the token but codes were offered, append the block(s) at
 * the end; if there are no codes, strip any stray token so it never reaches a customer.
 * Only codes present in `catalog` are rendered (we need real data to show).
 */
export function assembleOfferReply(
  reply: string,
  codes: string[],
  catalog: Map<string, InventorySearchResult>,
): string {
  const blocks = codes
    .slice(0, MAX_OFFERS)
    .map((c) => catalog.get(c))
    .filter((r): r is InventorySearchResult => r != null)
    .map(formatOfferBlock);

  const text = reply ?? "";

  if (blocks.length === 0) {
    // Remove a stray token and tidy the doubled spaces / blank lines it leaves behind.
    return text
      .replace(new RegExp(`\\s*${escapeRegExp(OFFER_TOKEN)}\\s*`, "g"), " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  const joined = blocks.join("\n\n");

  if (text.includes(OFFER_TOKEN)) {
    return text.split(OFFER_TOKEN).join(joined).trim();
  }

  // Token missing — append after the reply.
  return `${text.trim()}\n\n${joined}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/_shared/offer-reply.test.ts`
Expected: PASS — 9 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/offer-reply.ts supabase/functions/_shared/offer-reply.test.ts
git commit -m "feat(ai): offer-block assembler for emoji-formatted product replies"
```

---

## Task 4: Rewrite INVENTORY_RESPONSE_RULE for token output

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts:92-110` (the `INVENTORY_RESPONSE_RULE` template literal)
- Test: `supabase/functions/_shared/ai-providers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/_shared/ai-providers.test.ts`:

```typescript
import { buildEnhancedPrompt } from './ai-providers.ts';

Deno.test('enhanced prompt instructs token output and forbids markdown', () => {
  const p = buildEnhancedPrompt('PERSONA');
  // The model must emit the placeholder token, not its own spec/price/link.
  if (!p.includes('{{OFFER}}')) throw new Error('expected {{OFFER}} token instruction');
  // It must be told not to use markdown.
  if (!/no markdown/i.test(p)) throw new Error('expected a no-markdown instruction');
});
```

(Use the existing import style already at the top of `ai-providers.test.ts`; if `buildEnhancedPrompt` is not yet imported there, add it to the existing import from `'./ai-providers.ts'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: FAIL — current rule contains neither `{{OFFER}}` nor a no-markdown instruction.

- [ ] **Step 3: Update the rule**

In `supabase/functions/_shared/ai-providers.ts`, replace the `INVENTORY_RESPONSE_RULE` constant (the whole `const INVENTORY_RESPONSE_RULE = \`...\`;` block, currently lines 92-110) with:

```typescript
const INVENTORY_RESPONSE_RULE = `
# Response Strategy for Product Inquiries
First decide if the request is SPECIFIC or BROAD:
- SPECIFIC = the customer named a model/code/specs, or sent a photo/screenshot of one listing, or asks "is THIS still available?".
- BROAD = only a category/intent ("may laptop po ba kayo?", "may phone ba kayo?", "ano meron"), with no recipient, use-case, or budget yet.

For a SPECIFIC ask: confirm availability first. Use the search_inventory tool to find the matching AVAILABLE listing (it may be a different code than the customer quoted).
- If the message or photo shows a P-code (e.g. P001443) or G-code (e.g. G000022), search_inventory with that EXACT code FIRST — it's the precise listing the customer means. If the code search returns a result, answer from it directly.
- Only if the code search returns nothing (it may be sold), then search by a SHORT query — brand + model only, e.g. "Oppo A5 5G" or "iPhone 13" — to offer alternatives. Do NOT include storage, RAM, color, or condition in the query; those over-specify it and return nothing.
- If a search returns no results, SIMPLIFY and search again (fewer words) before saying anything. Try at least 2 phrasings.
- The "Available Inventory" list in the context is only a PARTIAL sample, NOT the full catalog. NEVER conclude an item is unavailable because it is missing from that list. Only say an item is unavailable if search_inventory itself returns ZERO matches for it.

## How to format a SPECIFIC offer (IMPORTANT)
When you confirm an available item, structure your reply as exactly THREE parts:
1. A SHORT, warm availability line that names the item (e.g. "Yes, available pa po ang Oppo A5 5G in Aurora Green! Meron po tayong 1 in stock! 😊").
2. The literal token {{OFFER}} on its OWN line. The system replaces it with the product's code, specs, grade, price, and order link — formatted consistently.
3. A SHORT closing line (e.g. "If you have any questions or need help ordering, let me know po!").
Do NOT write the code, specs, grade, price, or order link yourself — the {{OFFER}} token handles all of that.
Use NO markdown anywhere — no **bold**, no [text](url) links, no bullet characters. Plain text only.
Offer at most ONE item unless the customer explicitly asked to compare; include one {{OFFER}} token per offered item.

For a BROAD ask: do NOT dump a product and do NOT call search_inventory yet. Follow the active specialist's playbook to qualify first (reassure stock exists, then ask the key questions warmly), then hand off per the playbook. Do NOT use the {{OFFER}} token for a broad ask.

Keep replies short — the intro and closing are 1-2 sentences each. No walls of text.`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/ai-providers.test.ts`
Expected: PASS — including the new assertion. (If any pre-existing test asserted exact old rule text, update it to match the new rule.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts supabase/functions/_shared/ai-providers.test.ts
git commit -m "feat(ai): instruct model to emit {{OFFER}} token, no markdown, for offers"
```

---

## Task 5: Wire assembly into the real draft path

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts` (import + the block around `const offerCodes = deriveOfferCodes(...)`, currently ~line 199)

No new unit test (the assembler is already covered by Task 3; this is integration glue verified manually in Task 7). Keep the change minimal and obviously correct.

- [ ] **Step 1: Add the import**

In `supabase/functions/_shared/generate-draft.ts`, add to the imports near the top (next to the `inventory-search.ts` import):

```typescript
import { assembleOfferReply } from "./offer-reply.ts";
```

- [ ] **Step 2: Assemble the reply before saving**

Find this existing block (around line 199):

```typescript
  const offerCodes = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog);
  const offerAttachments = offerCodes.length
    ? await buildOfferAttachments(supabase, conversationId, offerCodes, offerCatalog)
    : [];
```

Insert, immediately after it:

```typescript
  // Splice the deterministic emoji offer block into the reply so the SAVED content (what any
  // send path — manual approve OR future auto-send — transmits verbatim) is the final message.
  const finalReply = assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog);
```

Then in the `supabase.from('messages').insert({ ... })` call below it, change:

```typescript
    content: aiResponse.reply,
```

to:

```typescript
    content: finalReply,
```

- [ ] **Step 3: Type-check the function**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): assemble emoji offer block into saved draft content"
```

---

## Task 6: Wire assembly into the Test Playground

**Files:**
- Modify: `supabase/functions/test-ai-reply/index.ts` (import + the `offers`/return block, ~line 200-230)

Make the playground preview byte-identical to what the customer receives.

- [ ] **Step 1: Add the import**

In `supabase/functions/test-ai-reply/index.ts`, add to the `_shared` imports near the top:

```typescript
import { assembleOfferReply } from "../_shared/offer-reply.ts";
```

- [ ] **Step 2: Assemble the reply, derive codes once**

Find the block that builds `offers` (it begins `const offers: TestOffer[] = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog)`). Replace from that line down to the `return new Response(...)` line with:

```typescript
    const offerCodes = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog);

    // Splice the emoji offer block into the reply so the playground shows the EXACT message
    // a customer would receive (identical to generate-draft's saved content).
    const finalReply = assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog);

    const offers: TestOffer[] = offerCodes
      .map((code) => {
        const r = offerCatalog.get(code);
        if (!r) return null;
        return {
          code: r.code,
          description: r.description,
          price: r.price,
          image_url: r.display_url ?? r.thumbnail_url,
        } as TestOffer;
      })
      .filter((o): o is TestOffer => o !== null);

    return new Response(JSON.stringify({ ...aiResponse, reply: finalReply, offers, tool_errors: toolErrors, tool_calls: toolCalls }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
```

(Note: `reply: finalReply` after `...aiResponse` overrides the raw reply so the playground bubble renders the assembled message.)

- [ ] **Step 3: Type-check the function**

Run: `deno check supabase/functions/test-ai-reply/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/test-ai-reply/index.ts
git commit -m "feat(ai): playground previews the assembled emoji offer reply"
```

---

## Task 7: Full verification (deploy + manual playground check)

**Files:** none (verification only)

- [ ] **Step 1: Run the whole edge test suite**

Run: `deno test supabase/functions/_shared/`
Expected: PASS — all suites green (item-description, offer-reply, inventory-search, ai-providers, plus untouched suites).

- [ ] **Step 2: Deploy the affected functions**

Per project convention (CLAUDE.md / feedback_supabase_migrations), deploy the edge functions so the playground exercises the new code:

Run: `supabase functions deploy test-ai-reply generate-pending-drafts missive-webhook`
Expected: deploys succeed. (`generate-pending-drafts` and `missive-webhook` both import the shared `generate-draft.ts`; confirm which functions import it with `grep -rl "generate-draft" supabase/functions/*/index.ts` and deploy those.)

- [ ] **Step 3: Manual playground check**

In the app: Admin → Messaging Settings → AI Test Playground. Send `available pa ba to?` with an Oppo A5 5G (or any in-stock item) photo/code. Confirm the reply bubble shows:
- A short intro line, then the emoji block (🏷 code / 📝 full specs / 🏅 Rank / 💴 ¥price / 📸 Buy Now & View Photos: bare URL), then a short closing line.
- The 📝 line shows the FULL spec string (RAM/storage/CPU/etc.), matching the manual agent paste.
- No `**` asterisks, no `[text](url)` brackets anywhere; the URL is a plain clickable link.
- The product photo still appears below.

- [ ] **Step 4: Bump version and commit**

Per feedback_versioning, bump `package.json` version once for this session:

```bash
# edit package.json "version" (patch bump), then:
git add package.json
git commit -m "chore: bump version for emoji-formatted AI offer replies"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 → Task 1; Component 2 → Task 2; Component 3 → Task 3; Component 4 → Task 4; Component 5 → Tasks 5 & 6; Component 6 (playground) → Task 6 (reply now carries the block; no extra UI code needed — badges/cards already render as internal decoration); Testing section → Tasks 1/2/3 + Task 7 manual.
- **Type consistency:** `assembleOfferReply(reply, codes, catalog)` and `formatOfferBlock(result)` signatures are used identically in Tasks 3, 5, 6. `InventorySearchResult` fields (`code`, `description`, `grade`, `price`, `order_url`, `display_url`, `thumbnail_url`) match `inventory-search.ts`. `getItemDescription(item, productModel, descriptionFields)` signature matches between Task 1 definition and Task 2 use.
- **Known limitation (per spec):** sell-group descriptions stay basic this pass; only items get the rich builder (the group RPC path is unchanged).
