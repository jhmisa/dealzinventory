# AI Playground Fixes + Attachment→KB Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the messaging AI able to quote Philippines shipping rates and other facts currently trapped in image attachments; stop markdown leaking in the Test Playground; and make the Canned Responses admin list searchable + let staff open attachments.

**Architecture:** Four independent workstreams. WS1 is a Supabase SQL migration that copies attachment facts into `knowledge_base` (the AI reads it with zero code change). WS2 edits two edge-function files (`test-ai-reply/index.ts`, `_shared/ai-providers.ts`) and redeploys. WS3 + WS4 are React-only changes in the messaging settings page / canned-response form.

**Tech Stack:** Supabase (Postgres migrations via CLI, Deno edge functions), React 18 + TypeScript + TanStack Query + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-02-ai-playground-fixes-kb-enrichment-design.md`

**Reference (facts already extracted from the 6 attachment images):** see spec WS1. All numbers in this plan are final.

---

## Verified facts about the codebase (read before starting)

- `knowledge_base` has **no unique constraint on `title`** → idempotent seeding uses `DELETE FROM ... WHERE title IN (...)` then `INSERT`.
- The AI prompt loader (`supabase/functions/_shared/generate-draft.ts`) selects `knowledge_base` where `is_active`; `buildSpecialistSystemPrompt` shows an article under a specialist when `specialist_tags` includes that specialist's slug (untagged = General Knowledge). No code change needed for new articles to appear.
- Existing KB articles that overlap and must NOT be contradicted: `Shipping Information` (PH prose, no numbers), `Payment Methods` (option list), `Condition Grades` (S/A/B/C/D/J).
- Specialist slugs in use: `sales`, `order_tracking`, `aftersales`, `kaitori`, `generalist`.
- Migrations are applied via the Supabase CLI (`supabase db push` / `supabase migration up`) — never asked, done automatically.
- `normalizeOutboundText` is exported from `supabase/functions/_shared/normalize-markdown.ts:19`.
- Production already normalizes (`generate-draft.ts:309`); the Playground (`test-ai-reply/index.ts:203`) does not.

---

## Task 1: WS1 — Seed knowledge_base from attachment facts (migration)

**Files:**
- Create: `supabase/migrations/20260702120000_kb_from_attachments.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260702120000_kb_from_attachments.sql` with exactly this content:

```sql
-- Convert facts trapped in template image attachments into AI-readable knowledge_base
-- articles. Templates + their images are untouched (they still auto-send the visuals);
-- these articles give the AI the TEXT so it can answer questions conversationally.
-- Facts sourced from the 6 template attachments (Joey verified 2026-07-02).
-- Idempotent: knowledge_base has no unique(title), so delete-by-title then insert.

DELETE FROM public.knowledge_base
WHERE title IN (
  'Philippines Express Shipping Rates',
  'How to Pay via PayPal',
  'How to Pay via SmartPit',
  'Order Redelivery (Yamato)',
  'Warranty & After-Sales Coverage',
  'Special Order Request'
);

INSERT INTO public.knowledge_base (entry_type, title, content, category, specialist_tags, is_active, sort_order) VALUES
('knowledge', 'Philippines Express Shipping Rates',
$$Philippines Express Shipping (Japan -> PH). All-inclusive — receiver pays nothing extra. Max 2 gadgets per order. Door-to-door; far/remote areas pick up at nearest LBC branch/warehouse.
Rates:
- Mobile phone, 1-2 units, NO box: ¥1,900
- Mobile phone, 1-2 units, WITH box: ¥2,800
- 1 phone + 1 tablet: ¥4,800
- Tablet, 1 or 2 units: ¥4,800
- Laptop 10-16", 1 unit: ¥4,800
- 2 laptops, or 1 gaming laptop: ¥7,800
- 1 laptop + 1 phone/tablet: ¥4,800
Lead time (after payment confirmed): Metro Manila & Luzon 3 weeks; Visayas & Mindanao 4 weeks.
Payment recommendation for PH-bound orders (depends on where the payer is):
- Paying FROM Japan -> recommend SmartPit. Pays: item price + international shipping fee.
- Paying FROM the Philippines -> recommend PayPal (Debit/Credit). Pays: item price + shipping + PayPal fee (5% if ¥10,000 or more, 10% if below ¥10,000).$$,
'Shipping', ARRAY['sales','order_tracking'], true, 10),

('knowledge', 'How to Pay via PayPal',
$$PayPal payment steps (for PH-side payers): 1) Open the PayPal link we send. 2) Verify the company name shown is "Yehey Japan Kabushiki Kaisha (株式会社イーエーヘイ・ジャパン)". 3) Enter the payment amount in Japanese Yen exactly as on the invoice we sent — triple-check to avoid errors/extra charges. 4) Enter the Order Number (format YJ-XXXXXX). 5) If you have a PayPal account, tap "PayPal"; if not, tap "Debit or Credit Card" and enter card number, expiry, CVV. 6) Choose to be charged in PHP or JPY (JPY uses your bank's conversion rate). 7) Enter name, address, mobile number, email. 8) Agree to the PayPal agreement & Privacy Statement, then tap Pay. 9) Screenshot the confirmation screen and keep it until the transaction is completed.$$,
'Payments', ARRAY['order_tracking'], true, 11),

('knowledge', 'How to Pay via SmartPit',
$$SmartPit payment (at a Japanese konbini). Go to the nearest Lawson/Ministop (Loppi machine) or FamilyMart (multi-copy machine).
Lawson/Ministop (Loppi): 1) Tap "Various ID Numbers". 2) Enter the SmartPit Number, tap Next. 3) Select "SmartPit Payment". 4) Select the amount to be paid, tap Next. 5) Review details, tap Confirm. 6) Bring the printed payment slip to the cashier.
FamilyMart (multi-copy): 1) Tap "FaMiMa/Edy/WAON/SmartPit". 2) Select "SmartPit". 3) Enter the SmartPit Number, tap OK. 4) Select the amount, tap OK. 5) Review, tap OK. 6) Bring the payment slip to the cashier.
A receipt prints after paying at the cashier. Send a photo of the receipt to customer support for processing.$$,
'Payments', ARRAY['order_tracking'], true, 12),

('knowledge', 'Order Redelivery (Yamato)',
$$Requesting redelivery of a missed Yamato delivery: 1) Find the attempted-delivery notice (ご不在連絡票) in your mailbox; redelivery info is on the back. 2) Note the delivery attempt date and your tracking number. 3) If you speak Japanese, call the driver directly using the number on the notice, give your tracking number, and coordinate redelivery. If you prefer English, call Yamato's automated phone service, provide your tracking number, and follow the voice prompts. 4) Wait for redelivery on your requested schedule.$$,
'Shipping', ARRAY['order_tracking','aftersales'], true, 13),

('knowledge', 'Warranty & After-Sales Coverage',
$$Warranty by condition: New (Rank S) = 3 months (7-day replacement + 2 months 3 weeks service warranty). Refurbished (Rank A/B/C/D) = 1 month (7-day replacement + 3 weeks service warranty). Accessories = 7-day replacement.
Replacement warranty covers factory defects (battery, screen, buttons, camera, speakers, ports). Service warranty covers device mishandling and factory defects unreported within 7 days. Warranty claims require the unit and all inclusions returned in good condition as received.$$,
'Products', ARRAY['sales','aftersales'], true, 14),

('knowledge', 'Special Order Request',
$$Special / out-of-stock order process: 1) Make a non-refundable downpayment (paid via SmartPit) so we order the requested unit. 2) Wait 5-7 days for it to arrive at our Tokyo warehouse. 3) Finalize details; delivery in 1-3 days after arrival.
Balance = Unit Price - downpayment + ¥1,000 standard shipping fee (except far areas). Final balance payable by COD, Credit Card (+4%), or SmartPit.$$,
'Shipping', ARRAY['sales'], true, 15);

-- Steer customer-facing wording of rank S without creating a duplicate ranking article.
UPDATE public.knowledge_base
SET content = $$Our grading system:
- S: New — pristine, factory condition. Always describe rank S to customers as "New" (not "S"); do not volunteer "open box" — the item description already indicates open-box when it applies.
- A: Very good — minimal signs of use
- B: Good — light scratches or wear
- C: Fair — visible wear but fully functional
- D: As-is — major cosmetic issues, may have functional issues
- J: Junk/parts only — NOT sold to customers$$
WHERE title = 'Condition Grades';
```

- [ ] **Step 2: Apply the migration via CLI**

Run: `supabase db push`
Expected: applies `20260702120000_kb_from_attachments.sql` with no error.

- [ ] **Step 3: Verify the 6 articles + the Condition Grades edit landed**

Run (psql via pooler, or the same authenticated REST call used during design):
```bash
supabase db push >/dev/null 2>&1; \
psql "$SUPABASE_DB_URL" -c "SELECT title, specialist_tags FROM knowledge_base WHERE title IN ('Philippines Express Shipping Rates','How to Pay via PayPal','How to Pay via SmartPit','Order Redelivery (Yamato)','Warranty & After-Sales Coverage','Special Order Request') ORDER BY title;"
```
Expected: 6 rows returned with the tags shown in Step 1. (If `SUPABASE_DB_URL` isn't set, verify via the authenticated REST query pattern from the design session, or Supabase Studio.)
Also confirm the `Condition Grades` S line now begins `- S: New — pristine`.

- [ ] **Step 4: Verify the AI now quotes the rate (end-to-end)**

In the app's AI Test Playground (`/admin/settings/messaging` → AI Test Playground), send: `magkano ang shipping papuntang Pilipinas kung laptop?`
Expected: the reply states **¥4,800** and mentions SmartPit (if paying from Japan) / PayPal (if paying from the Philippines). If it doesn't, confirm the article is `is_active=true` and tagged `sales`/`order_tracking`, and that the Playground reloaded the prompt.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702120000_kb_from_attachments.sql
git commit -m "feat(ai): seed knowledge_base from template attachment facts (PH rates, PayPal/SmartPit how-to, redelivery, warranty, special order) + S=New wording"
```

---

## Task 2: WS2a — Normalize markdown in the Test Playground

**Files:**
- Modify: `supabase/functions/test-ai-reply/index.ts` (import block ~line 12; `finalReply` ~line 203)

- [ ] **Step 1: Add the import**

In `supabase/functions/test-ai-reply/index.ts`, directly below the existing line 12 import of `assembleOfferReply`, add:

```ts
import { normalizeOutboundText } from "../_shared/normalize-markdown.ts";
```

- [ ] **Step 2: Wrap the final reply**

Change line ~203 from:

```ts
    const finalReply = assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog);
```

to:

```ts
    const finalReply = normalizeOutboundText(assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog));
```

This mirrors production (`generate-draft.ts:309`) exactly, so the Playground shows what a customer actually receives.

- [ ] **Step 3: Deploy the function**

Run: `supabase functions deploy test-ai-reply`
Expected: deploy succeeds.

- [ ] **Step 4: Verify in the Playground**

Send a message that triggers a multi-item reply (e.g. `pinaka mura na Oppo?`).
Expected: the reply contains **no** `**` and **no** `[label](url)` markdown; any offer link appears as a bare URL.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/test-ai-reply/index.ts
git commit -m "fix(ai): normalize markdown in Test Playground so preview matches production sends"
```

---

## Task 3: WS2b — Prompt rule for clean multi-item offers

**Files:**
- Modify: `supabase/functions/_shared/ai-providers.ts` (`INVENTORY_RESPONSE_RULE`, lines 131–154; the relevant instruction is line 146 + line 150)

- [ ] **Step 1: Strengthen the multi-item instruction**

In `supabase/functions/_shared/ai-providers.ts`, replace line 150:

```ts
Prefer offering ONE best-matching item unless the customer explicitly asked to compare.
```

with:

```ts
Prefer offering ONE best-matching item. If you do offer multiple items (e.g. the customer asked for cheapest options or to compare), emit ONE {{OFFER:CODE}} token per item, each on its OWN line — never a hand-written list, and never use **bold**, [label](url) links, numbered "1./2./3." product lines, or dashes. Each token renders as a clean block with the code, specs, grade, price, photo, and order link.
```

Leave lines 146, 148, 149 unchanged (they already forbid markdown and hand-written offer details; this makes the multi-item case explicit).

- [ ] **Step 2: Deploy the affected functions**

The `_shared/ai-providers.ts` change is bundled into every function that generates replies. Run:

```bash
supabase functions deploy test-ai-reply
supabase functions deploy generate-pending-drafts
supabase functions deploy missive-webhook
```
Expected: all three deploy successfully.

- [ ] **Step 3: Verify multi-item formatting in the Playground**

Send: `yung pinaka mura lang na Oppo?`
Expected: 2–3 suggestions, each rendered as a separate offer block (emoji block + photo), with no markdown and no `1./2./3.` hand-written lines.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/ai-providers.ts
git commit -m "feat(ai): instruct model to render multi-item offers as stacked {{OFFER:CODE}} blocks, no markdown lists"
```

---

## Task 4: WS3 — Search + collapsible category groups on Canned Responses list

**Files:**
- Modify: `src/pages/admin/messaging-settings.tsx` (Canned Responses card, lines ~1366–1438; add local state + a `useMemo`; the page already imports `useSpecialists` at line 567 and `useTemplates` results as `templates`)

Reference patterns already in the repo: search `useMemo` filter in `src/components/messaging/canned-responses-panel.tsx:48–57`; shadcn `Collapsible` usage — confirm the component exists at `src/components/ui/collapsible.tsx` before using it (Step 1).

- [ ] **Step 1: Confirm the Collapsible primitive exists**

Run: `ls src/components/ui/collapsible.tsx && grep -n "CollapsibleTrigger\|CollapsibleContent" src/components/ui/collapsible.tsx`
Expected: file exists and exports `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`. If it does NOT exist, run `npx shadcn@latest add collapsible` (or copy the Radix wrapper following the existing `src/components/ui/*` pattern) before proceeding.

- [ ] **Step 2: Add search state + imports near the top of the component**

In `src/pages/admin/messaging-settings.tsx`, add to the existing lucide-react import a `Search` and `ChevronDown` icon (append to the existing icon import list), add the Collapsible import, and ensure `Input` is imported (it is used elsewhere on the page; confirm). Then, inside `MessagingSettingsPage`, near the other `useState` hooks, add:

```tsx
const [templateSearch, setTemplateSearch] = useState('')
```

- [ ] **Step 3: Build the grouped, filtered derivation**

Below where `templates` and `specialists` are available (after line ~567), add:

```tsx
const groupedTemplates = useMemo(() => {
  const q = templateSearch.trim().toLowerCase()
  const filtered = q
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.content_en.toLowerCase().includes(q) ||
          t.content_ja.toLowerCase().includes(q),
      )
    : templates
  const specialistLabel = (slug: string | null) => {
    if (!slug) return 'Uncategorized / Global'
    return specialists.find((s) => s.slug === slug)?.name ?? slug
  }
  const groups = new Map<string, { label: string; items: typeof templates }>()
  for (const t of filtered) {
    const key = t.specialist_slug ?? '__global__'
    if (!groups.has(key)) groups.set(key, { label: specialistLabel(t.specialist_slug), items: [] })
    groups.get(key)!.items.push(t)
  }
  // Global bucket last; the rest alphabetical by label.
  return Array.from(groups.entries())
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => (a.key === '__global__' ? 1 : b.key === '__global__' ? -1 : a.label.localeCompare(b.label)))
}, [templates, specialists, templateSearch])
```

- [ ] **Step 4: Add the search box in the card header**

In the Canned Responses `CardHeader` (lines ~1366–1381), add a search `Input` under the title/description (or beside the New Template button). Insert, just before the closing `</CardHeader>`:

```tsx
<div className="relative mt-3">
  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
  <Input
    value={templateSearch}
    onChange={(e) => setTemplateSearch(e.target.value)}
    placeholder="Search canned responses by name or content…"
    className="pl-8"
  />
</div>
```

- [ ] **Step 5: Replace the flat list with collapsible groups**

In `<CardContent>` (lines ~1382–1436), replace the `<div className="space-y-3">{templates.map((t) => ( … ))}</div>` block with grouping. Keep the exact existing row JSX (title + `AI_USAGE_BADGE` badge + `specialist_slug` badge + attachment badge + Inactive badge + edit/delete buttons + description + Variables line) inside the inner map — only wrap it in groups:

```tsx
<div className="space-y-3">
  {groupedTemplates.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-6">No matching canned responses.</p>
  ) : (
    groupedTemplates.map((group) => (
      <Collapsible key={group.key} defaultOpen={!!templateSearch}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
          <span>{group.label} <span className="text-muted-foreground">({group.items.length})</span></span>
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          {group.items.map((t) => (
            /* PASTE the existing per-template row JSX here, unchanged, keyed by t.id */
          ))}
        </CollapsibleContent>
      </Collapsible>
    ))
  )}
</div>
```

Note: `defaultOpen={!!templateSearch}` keeps groups collapsed by default but auto-expands them while a search is active. When search is empty, groups render collapsed; a user can expand any group. (If you prefer all groups open by default when there's no search, use `defaultOpen`. Confirm with the reviewer; default here is collapsed-when-idle.)

- [ ] **Step 6: Typecheck + run the app**

Run: `npm run build` (or `npx tsc --noEmit` if faster)
Expected: no TypeScript errors. Then run `npm run dev`, open `/admin/settings/messaging`, scroll to Canned Responses.
Verify: groups appear with counts; typing in the search filters across groups and expands matching groups; the "Uncategorized / Global" bucket exists and sorts last; edit/delete still work.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/messaging-settings.tsx src/components/ui/collapsible.tsx
git commit -m "feat(messaging): search + collapsible category groups on Canned Responses admin list"
```

---

## Task 5: WS4 — Open/preview existing attachments in the template editor

**Files:**
- Modify: `src/components/messaging/canned-response-form.tsx` (attachment list, lines ~227–253; imports at top)

Reference: `getAttachmentSignedUrl` is exported from `src/services/messaging.ts:260`; the lazy-thumbnail pattern lives in `src/components/messaging/message-composer.tsx:205–208`.

- [ ] **Step 1: Import the signed-URL helper and effect hooks**

At the top of `src/components/messaging/canned-response-form.tsx`, ensure `useEffect` is imported from React, and add:

```ts
import { getAttachmentSignedUrl } from '@/services/messaging'
```

(Confirm `useState` is already imported — it is, since the file uses `useState` at line 42.)

- [ ] **Step 2: Add lazy thumbnail state + loader**

Inside the component, near the existing `attachments` state (line 42), add:

```tsx
const [attThumbs, setAttThumbs] = useState<Record<string, string>>({})

useEffect(() => {
  let cancelled = false
  attachments.forEach((att) => {
    if (attThumbs[att.file_url]) return
    getAttachmentSignedUrl(att.file_url)
      .then((url) => { if (!cancelled) setAttThumbs((p) => ({ ...p, [att.file_url]: url })) })
      .catch(() => { /* leave as filename-only if signing fails */ })
  })
  return () => { cancelled = true }
}, [attachments, attThumbs])
```

- [ ] **Step 3: Make each attachment row openable**

In the attachment map (lines ~229–252), replace the static icon + filename portion so images show a clickable thumbnail and the filename is a clickable link. Replace the icon+`<span className="truncate flex-1">{att.filename}</span>` portion with:

```tsx
{att.mime_type?.startsWith('image/') && attThumbs[att.file_url] ? (
  <button
    type="button"
    onClick={() => window.open(attThumbs[att.file_url], '_blank')}
    className="shrink-0"
    title="Open attachment"
  >
    <img
      src={attThumbs[att.file_url]}
      alt={att.filename}
      className="h-8 w-8 rounded object-cover"
    />
  </button>
) : att.mime_type?.startsWith('video/') ? (
  <FilmIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
) : (
  <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
)}
<button
  type="button"
  onClick={() => {
    const url = attThumbs[att.file_url]
    if (url) window.open(url, '_blank')
  }}
  className="truncate flex-1 text-left hover:underline disabled:no-underline"
  disabled={!attThumbs[att.file_url]}
  title="Open attachment"
>
  {att.filename}
</button>
```

Keep the size span and the remove (X) button exactly as they are.

- [ ] **Step 4: Typecheck + verify in the app**

Run: `npx tsc --noEmit`
Expected: no errors. Then `npm run dev`, open `/admin/settings/messaging` → Canned Responses → edit `Info: Express Service`.
Verify: the attachment row shows a small thumbnail of `Express Service Information.png`; clicking the thumbnail or filename opens the image in a new tab.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/canned-response-form.tsx
git commit -m "fix(messaging): make template attachments openable (thumbnail + click-to-open signed URL)"
```

---

## Task 6: Finalize — version bump, project state, deploy

**Files:**
- Modify: `package.json` (version), `docs/PROJECT_STATE.md`

- [ ] **Step 1: Bump the version**

Bump `package.json` version once for this session (semver minor — this adds features). E.g. `1.90.0` → `1.91.0`.

- [ ] **Step 2: Update PROJECT_STATE.md**

In `docs/PROJECT_STATE.md` under **Now / Recently shipped**, add a bullet summarizing: KB enriched from 6 template attachments (PH rates incl. JP→SmartPit / PH→PayPal rule, PayPal/SmartPit how-to, redelivery, warranty, special order; S=New wording); Playground markdown normalization + clean multi-item offer blocks; Canned Responses search + collapsible groups; openable template attachments. Note which files/tables it touched.

- [ ] **Step 3: Commit**

```bash
git add package.json docs/PROJECT_STATE.md
git commit -m "chore: bump version + log AI playground fixes + attachment→KB enrichment"
```

- [ ] **Step 4: Deploy**

Use the `push-to-main` skill (or push the branch and open a PR, per Joey's preference at execution time). Migrations are already applied to the linked project from Task 1; the edge functions were deployed in Tasks 2–3. Frontend (WS3/WS4) deploys via Vercel on merge to main.

---

## Self-Review (completed by author)

**Spec coverage:**
- WS1 (attachment→KB) → Task 1 (all 6 articles + Condition Grades update). ✓
- WS2a (playground normalize) → Task 2. ✓
- WS2b (multi-item offers) → Task 3. ✓
- WS3 (search + collapsible groups) → Task 4. ✓
- WS4 (openable attachments) → Task 5. ✓
- Version bump + PROJECT_STATE + deploy → Task 6. ✓

**Placeholder scan:** No TBD/TODO. The only "paste the existing JSX here" instruction (Task 4 Step 5) is deliberate — it re-uses the current row markup verbatim to avoid transcribing 40 lines that must match exactly; the surrounding wrapper is fully specified.

**Type consistency:** `templateSearch`/`groupedTemplates`/`attThumbs` are defined where first used; `getAttachmentSignedUrl` and `normalizeOutboundText` signatures match their real exports; `MessagingTemplate` fields referenced (`name`, `content_en`, `content_ja`, `specialist_slug`, `attachments`, `mime_type`, `file_url`) all exist per `src/lib/types.ts`.

**Risks / notes:**
- Task 1 Step 3's `psql` command assumes `$SUPABASE_DB_URL`; fallback (REST/Studio) is stated.
- Task 4 Step 1 gates on the shadcn `Collapsible` primitive existing; adds it if missing.
- Yen amounts and Japanese text in the migration use `$$` dollar-quoting to avoid escaping issues.
