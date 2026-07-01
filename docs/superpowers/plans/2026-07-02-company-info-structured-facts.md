# Company Info — Structured Facts Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give volatile company facts (bank/SmartPit numbers, PayPal name, addresses, phones, shipping rates, order format `YJ-XXXXXX`) ONE structured home — a `company_facts` table — that the messaging AI reads as an authoritative reference block.

**Architecture:** A new `company_facts` key/value table is fetched by the shared `generate-draft.ts` loader and rendered by `build-specialist-prompt.ts` as a `# Company Facts` section placed after the persona and before the specialist playbooks. Staff manage facts through a new "Company Facts" card in the Messaging Settings admin page. Templates and KB content are left unchanged (de-duplication is out of scope).

**Tech Stack:** Postgres (Supabase migration), Deno edge functions (TypeScript, `deno test`), React 18 + TanStack Query + shadcn/ui admin UI.

**Spec:** [`docs/superpowers/specs/2026-07-02-company-info-structured-facts-design.md`](../specs/2026-07-02-company-info-structured-facts-design.md)

**Reference files to mirror (read before starting):**
- Table + RLS + seed pattern: `supabase/migrations/20260413200000_knowledge_base.sql`
- Prompt render + tests: `supabase/functions/_shared/build-specialist-prompt.ts` + `.test.ts`
- Loader: `supabase/functions/_shared/generate-draft.ts` (lines 87–160)
- TS types: `src/lib/types.ts` (KnowledgeBaseEntry block, lines 533–566)
- Service CRUD: `src/services/messaging.ts` (Knowledge Base block, lines 514–552)
- Query keys: `src/lib/query-keys.ts` (messaging block, lines 222–239)
- Hooks: `src/hooks/use-messaging.ts` (Knowledge Base block, lines 284–323)
- Admin UI form + section: `src/pages/admin/messaging-settings.tsx` (KbEntryFormDialog 433–566; sections 1115–1244; handlers 772–798)

---

## Task 1: Database migration — `company_facts` table (structure only)

**Files:**
- Create: `supabase/migrations/20260702130000_company_facts.sql`
- Modify (regenerate): `src/lib/database.types.ts`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260702130000_company_facts.sql`:

```sql
-- Structured company facts: ONE authoritative home for volatile values
-- (bank/SmartPit numbers, PayPal name, addresses, phones, shipping rates,
-- order-number format) that the messaging AI reads as fact. See
-- docs/superpowers/specs/2026-07-02-company-info-structured-facts-design.md
CREATE TABLE company_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  label       text NOT NULL,
  value_en    text NOT NULL,
  value_ja    text,
  category    text NOT NULL DEFAULT 'General',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_facts_active ON company_facts(is_active, category, sort_order);

ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON company_facts FOR ALL USING (auth.role() = 'authenticated');

-- Explicit Data-API grants (alongside RLS) per CLAUDE.md convention.
GRANT ALL ON public.company_facts TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration via Supabase CLI**

Run: `supabase db push`
Expected: migration `20260702130000_company_facts` applied, no errors.

- [ ] **Step 3: Verify the table exists**

Run: `supabase db push` is idempotent; confirm with a quick query via CLI:
`echo "select count(*) from company_facts;" | supabase db query 2>/dev/null || supabase migration list`
Expected: `company_facts` present in migration list / query returns `0`.

- [ ] **Step 4: Regenerate database types**

Run: `supabase gen types typescript --linked > src/lib/database.types.ts`
Expected: `company_facts` Row/Insert/Update types appear in `src/lib/database.types.ts`.

> NOTE: This regenerates `database.types.ts` (the generated file) — NOT `src/lib/types.ts` (the hand-maintained alias layer, edited in Task 4). Do not run `gen types > types.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702130000_company_facts.sql src/lib/database.types.ts
git commit -m "feat(messaging): add company_facts table for structured company info"
```

---

## Task 2: Prompt renderer — `CompanyFact` type + `# Company Facts` block (TDD)

**Files:**
- Modify: `supabase/functions/_shared/build-specialist-prompt.ts`
- Test: `supabase/functions/_shared/build-specialist-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/_shared/build-specialist-prompt.test.ts` (also add `CompanyFact` to the import on line 2–7: `type CompanyFact,`):

```ts
Deno.test('buildSpecialistSystemPrompt renders company facts grouped by category', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'PERSONA',
    knowledge: [],
    specialists: [],
    companyFacts: [
      { key: 'paypal_name', label: 'PayPal account name', value_en: 'Yehey Japan Kabushiki Kaisha', value_ja: null, category: 'Payment' },
      { key: 'bank_holder', label: 'Bank account name', value_en: 'Yehey Japan K.K.', value_ja: 'ヤヘイジャパン株式会社', category: 'Banking' },
    ],
  });
  assertStringIncludes(prompt, '# Company Facts');
  assertStringIncludes(prompt, '## Payment');
  assertStringIncludes(prompt, '- PayPal account name: Yehey Japan Kabushiki Kaisha');
  assertStringIncludes(prompt, '## Banking');
  assertStringIncludes(prompt, '- Bank account name: Yehey Japan K.K. (JA: ヤヘイジャパン株式会社)');
});

Deno.test('buildSpecialistSystemPrompt omits JA suffix when value_ja is empty', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: [],
    companyFacts: [{ key: 'order_format', label: 'Order number format', value_en: 'YJ-XXXXXX', value_ja: null, category: 'Orders' }],
  });
  assert(!prompt.includes('(JA:'));
  assertStringIncludes(prompt, '- Order number format: YJ-XXXXXX');
});

Deno.test('buildSpecialistSystemPrompt omits the Company Facts block when there are no facts', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: [],
  });
  assert(!prompt.includes('# Company Facts'));
});

Deno.test('Company Facts block sits after persona and before Specialist Playbooks', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'PERSONA_BODY', knowledge: [],
    specialists: SPECIALISTS,
    companyFacts: [{ key: 'k', label: 'L', value_en: 'V', value_ja: null, category: 'Orders' }],
  });
  const personaIdx = prompt.indexOf('PERSONA_BODY');
  const factsIdx = prompt.indexOf('# Company Facts');
  const playbookIdx = prompt.indexOf('# Specialist Playbooks');
  assert(personaIdx < factsIdx && factsIdx < playbookIdx);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: FAIL — `CompanyFact` is not exported / `companyFacts` not accepted / block not rendered.

- [ ] **Step 3: Add the `CompanyFact` interface and the arg**

In `supabase/functions/_shared/build-specialist-prompt.ts`, add after the `TemplateReply` interface (after line 37):

```ts
// A structured company fact (bank/SmartPit numbers, PayPal name, addresses, rates,
// order format). Rendered as an authoritative reference block the AI treats as fact.
export interface CompanyFact {
  key: string;
  label: string;
  value_en: string;
  value_ja?: string | null;
  category: string;
}
```

Add to `BuildSpecialistPromptArgs` (inside the interface, after `templates?`):

```ts
  companyFacts?: CompanyFact[];
```

- [ ] **Step 4: Add the render helper**

In the same file, add this pure helper above `buildSpecialistSystemPrompt`:

```ts
// Render active company facts as a "# Company Facts" section, grouped by category.
// Categories appear in first-seen order (input is pre-sorted by category, sort_order);
// facts keep loader order within a category. Returns '' when there are no facts.
function renderCompanyFacts(facts: CompanyFact[]): string {
  if (facts.length === 0) return '';
  const order: string[] = [];
  const byCategory = new Map<string, CompanyFact[]>();
  for (const f of facts) {
    if (!byCategory.has(f.category)) {
      byCategory.set(f.category, []);
      order.push(f.category);
    }
    byCategory.get(f.category)!.push(f);
  }
  const sections = order
    .map((cat) => {
      const lines = byCategory
        .get(cat)!
        .map((f) => `- ${f.label}: ${f.value_en}${f.value_ja ? ` (JA: ${f.value_ja})` : ''}`)
        .join('\n');
      return `## ${cat}\n${lines}`;
    })
    .join('\n\n');
  return `\n\n# Company Facts (authoritative — use these EXACT values; never invent account numbers, company names, addresses, or rates. If a needed fact is missing, escalate.)\n${sections}`;
}
```

- [ ] **Step 5: Call the helper after the persona**

In `buildSpecialistSystemPrompt`, immediately after `prompt += personaSystemPrompt;` (line 78), add:

```ts
  // Company Facts: authoritative reference block, right after the persona.
  prompt += renderCompanyFacts(args.companyFacts ?? []);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/build-specialist-prompt.test.ts`
Expected: PASS — all new tests plus the existing suite green.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/build-specialist-prompt.ts supabase/functions/_shared/build-specialist-prompt.test.ts
git commit -m "feat(messaging): render Company Facts block in specialist prompt"
```

---

## Task 3: Loader — fetch facts in `generate-draft.ts`

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Import the `CompanyFact` type**

In `generate-draft.ts`, extend the existing `build-specialist-prompt.ts` import (lines 15–19) to add the type:

```ts
import {
  buildSpecialistSystemPrompt,
  specialistForIntent,
  type SpecialistRow,
  type CompanyFact,
} from "./build-specialist-prompt.ts";
```

- [ ] **Step 2: Fetch active company facts**

After the knowledge mapping (after line 105, right before the `// 2c. Fetch active specialists` comment), add:

```ts
  // 2b-bis. Fetch active structured company facts (authoritative reference block).
  const { data: factRows } = await supabase
    .from('company_facts')
    .select('key, label, value_en, value_ja, category, sort_order')
    .eq('is_active', true)
    .order('category')
    .order('sort_order');
  const companyFacts = (factRows ?? []) as CompanyFact[];
```

- [ ] **Step 3: Pass facts into the prompt builder**

In the `buildSpecialistSystemPrompt({ ... })` call (lines 151–160), add `companyFacts,` alongside `knowledge,` and `specialists,`:

```ts
  const fullSystemPrompt = buildSpecialistSystemPrompt({
    guardrails,
    personaSystemPrompt: persona.system_prompt,
    knowledge,
    companyFacts,
    specialists,
    templates: templateCatalog.map((t) => ({
      name: t.name, content_en: t.content_en, specialist_slug: t.specialist_slug,
      ai_usage: t.ai_usage, has_media: (t.attachments?.length ?? 0) > 0,
    })),
  });
```

- [ ] **Step 4: Type-check the edge module**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(messaging): load company_facts into the AI draft prompt"
```

---

## Task 4: Frontend types — `CompanyFact` in `types.ts`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the types by hand**

In `src/lib/types.ts`, after `KnowledgeBaseEntryUpdate` (after line 566), add:

```ts
// Company Facts (structured company info the AI reads as fact)
export interface CompanyFact {
  id: string
  key: string
  label: string
  value_en: string
  value_ja: string | null
  category: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanyFactInsert {
  key: string
  label: string
  value_en: string
  value_ja?: string | null
  category?: string
  sort_order?: number
  is_active?: boolean
}

export interface CompanyFactUpdate {
  key?: string
  label?: string
  value_en?: string
  value_ja?: string | null
  category?: string
  sort_order?: number
  is_active?: boolean
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (types are unused so far — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(messaging): add CompanyFact frontend types"
```

---

## Task 5: Service — CRUD functions in `messaging.ts`

**Files:**
- Modify: `src/services/messaging.ts`

- [ ] **Step 1: Import the types**

In `src/services/messaging.ts`, add `CompanyFact, CompanyFactInsert, CompanyFactUpdate` to the existing `from '@/lib/types'` import block (ends line 22).

- [ ] **Step 2: Add the CRUD functions**

After `deleteKnowledgeBaseEntry` (after line 552), add:

```ts
// ---------- Company Facts ----------

export async function getCompanyFacts() {
  const { data, error } = await supabase
    .from('company_facts')
    .select('*')
    .order('category')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CompanyFact[]
}

export async function createCompanyFact(fact: CompanyFactInsert) {
  const { data, error } = await supabase
    .from('company_facts')
    .insert(fact)
    .select()
    .single()
  if (error) throw error
  return data as CompanyFact
}

export async function updateCompanyFact(id: string, updates: CompanyFactUpdate) {
  const { data, error } = await supabase
    .from('company_facts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CompanyFact
}

export async function deleteCompanyFact(id: string) {
  const { error } = await supabase
    .from('company_facts')
    .delete()
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/messaging.ts
git commit -m "feat(messaging): company_facts service CRUD"
```

---

## Task 6: Query key + hooks

**Files:**
- Modify: `src/lib/query-keys.ts`
- Modify: `src/hooks/use-messaging.ts`

- [ ] **Step 1: Add the query key**

In `src/lib/query-keys.ts`, inside the `messaging` block, after the `knowledgeBase` line (line 236), add:

```ts
    companyFacts: () => [...queryKeys.messaging.all, 'company-facts'] as const,
```

- [ ] **Step 2: Import the insert/update types**

In `src/hooks/use-messaging.ts`, add `CompanyFactInsert, CompanyFactUpdate` to the `from '@/lib/types'` import block (lines 7–16).

- [ ] **Step 3: Add the hooks**

After `useDeleteKnowledgeBaseEntry` (after line 323), add:

```ts
// ---------- Company Facts ----------

export function useCompanyFacts() {
  return useQuery({
    queryKey: queryKeys.messaging.companyFacts(),
    queryFn: () => messagingService.getCompanyFacts(),
  })
}

export function useCreateCompanyFact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fact: CompanyFactInsert) => messagingService.createCompanyFact(fact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.companyFacts() })
    },
  })
}

export function useUpdateCompanyFact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CompanyFactUpdate }) =>
      messagingService.updateCompanyFact(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.companyFacts() })
    },
  })
}

export function useDeleteCompanyFact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteCompanyFact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.companyFacts() })
    },
  })
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/hooks/use-messaging.ts
git commit -m "feat(messaging): company_facts query key + hooks"
```

---

## Task 7: Admin UI — "Company Facts" section

**Files:**
- Modify: `src/pages/admin/messaging-settings.tsx`

- [ ] **Step 1: Import hooks, type, and an icon**

Add to the `@/hooks/use-messaging` import block (lines 40–58):

```ts
  useCompanyFacts,
  useCreateCompanyFact,
  useUpdateCompanyFact,
  useDeleteCompanyFact,
```

Add `CompanyFact` to the `@/lib/types` import (line 61). Add `Landmark` to the `lucide-react` import (line 2).

- [ ] **Step 2: Add the slug helper and the form dialog component**

Add near `KbEntryFormDialog` (after line 566, i.e. after the KB form component closes). First the category list + slug helper, then the dialog:

```tsx
const FACT_CATEGORY_OPTIONS = ['Company', 'Payment', 'Banking', 'Shipping', 'Contact', 'Orders'] as const

// Auto-derive a stable key slug from the label so staff never hand-type it.
function slugifyFactKey(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function CompanyFactFormDialog({
  open,
  onOpenChange,
  fact,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fact?: CompanyFact | null
}) {
  const [label, setLabel] = useState(fact?.label ?? '')
  const [factKey, setFactKey] = useState(fact?.key ?? '')
  const [keyEdited, setKeyEdited] = useState(!!fact)
  const [valueEn, setValueEn] = useState(fact?.value_en ?? '')
  const [valueJa, setValueJa] = useState(fact?.value_ja ?? '')
  const [category, setCategory] = useState(fact?.category ?? 'Company')
  const [isActive, setIsActive] = useState(fact?.is_active ?? true)

  const createFact = useCreateCompanyFact()
  const updateFact = useUpdateCompanyFact()

  const isEdit = !!fact
  const isPending = createFact.isPending || updateFact.isPending

  // Re-sync when opened on a different fact (mirrors KbEntryFormDialog's reset pattern).
  if (isEdit && label !== fact.label && !isPending) {
    setLabel(fact.label)
    setFactKey(fact.key)
    setKeyEdited(true)
    setValueEn(fact.value_en)
    setValueJa(fact.value_ja ?? '')
    setCategory(fact.category)
    setIsActive(fact.is_active)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label || !valueEn) return
    const finalKey = (factKey || slugifyFactKey(label)).trim()
    if (!finalKey) return

    if (isEdit) {
      updateFact.mutate(
        { id: fact.id, updates: { key: finalKey, label, value_en: valueEn, value_ja: valueJa || null, category, is_active: isActive } },
        {
          onSuccess: () => { toast.success('Fact updated'); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      createFact.mutate(
        { key: finalKey, label, value_en: valueEn, value_ja: valueJa || null, category, is_active: isActive },
        {
          onSuccess: () => { toast.success('Fact created'); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'New'} Company Fact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACT_CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                if (!keyEdited) setFactKey(slugifyFactKey(e.target.value))
              }}
              placeholder="e.g. PayPal account name"
            />
          </div>
          <div className="space-y-2">
            <Label>Key <span className="text-xs text-muted-foreground">(auto-generated; edit only if needed)</span></Label>
            <Input
              value={factKey}
              onChange={(e) => { setKeyEdited(true); setFactKey(e.target.value) }}
              className="font-mono text-sm"
              placeholder="paypal_account_name"
            />
          </div>
          <div className="space-y-2">
            <Label>Value (EN)</Label>
            <Textarea
              value={valueEn}
              onChange={(e) => setValueEn(e.target.value)}
              className="min-h-[70px] text-sm"
              placeholder="e.g. Yehey Japan Kabushiki Kaisha"
            />
          </div>
          <div className="space-y-2">
            <Label>Value (JA) <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={valueJa}
              onChange={(e) => setValueJa(e.target.value)}
              className="min-h-[70px] text-sm"
              placeholder="日本語の値（任意）"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Active</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !label || !valueEn}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Add page state, data, and handlers**

In `MessagingSettingsPage`, after the KB state (line 648) add:

```tsx
  const [factFormOpen, setFactFormOpen] = useState(false)
  const [editFact, setEditFact] = useState<CompanyFact | null>(null)
```

After the KB data hooks (line 660) add:

```tsx
  const { data: companyFacts = [], isLoading: loadingFacts } = useCompanyFacts()
  const updateFactMutation = useUpdateCompanyFact()
  const deleteFactMutation = useDeleteCompanyFact()
```

After `knowledgeArticles` (line 666) add a grouped-by-category view:

```tsx
  const factsByCategory = useMemo(() => {
    const groups = new Map<string, CompanyFact[]>()
    for (const f of companyFacts) {
      if (!groups.has(f.category)) groups.set(f.category, [])
      groups.get(f.category)!.push(f)
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }))
  }, [companyFacts])
```

After `handleDeleteKbEntry` (line 798) add:

```tsx
  function handleToggleFact(fact: CompanyFact) {
    updateFactMutation.mutate(
      { id: fact.id, updates: { is_active: !fact.is_active } },
      {
        onSuccess: () => toast.success(`${fact.label} ${fact.is_active ? 'disabled' : 'enabled'}`),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleMoveFact(fact: CompanyFact, direction: 'up' | 'down') {
    const sameCategory = companyFacts.filter((f) => f.category === fact.category)
    const idx = sameCategory.findIndex((f) => f.id === fact.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sameCategory.length) return
    const swap = sameCategory[swapIdx]
    updateFactMutation.mutate({ id: fact.id, updates: { sort_order: swap.sort_order } })
    updateFactMutation.mutate({ id: swap.id, updates: { sort_order: fact.sort_order } })
  }

  function handleDeleteFact(fact: CompanyFact) {
    deleteFactMutation.mutate(fact.id, {
      onSuccess: () => toast.success(`${fact.label} deleted`),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }
```

- [ ] **Step 4: Render the section card + dialog**

Immediately after the Knowledge Base `</Card>` and before the `<KbEntryFormDialog ... />` (around line 1240), add:

```tsx
      {/* Company Facts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5" />
                Company Facts
              </CardTitle>
              <CardDescription>Structured company info (bank/PayPal, addresses, rates, order format) the AI reads as authoritative fact</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditFact(null); setFactFormOpen(true) }}>
              <Plus className="h-4 w-4" />
              Add Fact
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFacts ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : companyFacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No company facts yet. Add facts like PayPal name, bank details, or the order-number format.
            </p>
          ) : (
            <div className="space-y-5">
              {factsByCategory.map(({ category, items }) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
                  <div className="space-y-2">
                    {items.map((f, idx) => (
                      <div
                        key={f.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${!f.is_active ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Switch checked={f.is_active} onCheckedChange={() => handleToggleFact(f)} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{f.label}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {f.value_en}{f.value_ja ? ` · JA: ${f.value_ja}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button size="icon-xs" variant="ghost" onClick={() => handleMoveFact(f, 'up')} disabled={idx === 0}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => handleMoveFact(f, 'down')} disabled={idx === items.length - 1}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => { setEditFact(f); setFactFormOpen(true) }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => handleDeleteFact(f)} disabled={deleteFactMutation.isPending}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CompanyFactFormDialog
        open={factFormOpen}
        onOpenChange={setFactFormOpen}
        fact={editFact}
      />
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Build to confirm the page compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/messaging-settings.tsx
git commit -m "feat(messaging): Company Facts admin section"
```

---

## Task 8: Seed the known facts (interactive — confirm values with Joey)

**Files:**
- Create: `supabase/migrations/20260702140000_company_facts_seed.sql`

- [ ] **Step 1: Extract the current live values**

Query the live DB for the prose that currently holds these facts, so the seed uses real values (not guesses):

```bash
supabase db query "select title, content from knowledge_base where content ~* 'paypal|smartpit|bank|振込|口座|YJ-|address|住所|phone|LBC|shipping';"
supabase db query "select name, content_en, content_ja from messaging_templates where content_en ~* 'paypal|smartpit|bank|振込|口座|YJ-|address|住所|phone|LBC';"
```

(If `supabase db query` is unavailable, run the same SQL through the CLI's psql connection.)

- [ ] **Step 2: Compile the candidate fact list and CONFIRM with Joey**

Build a table of `category · label · key · value_en · value_ja` covering: order format (`YJ-XXXXXX`), PayPal account name, SmartPit number, accepted-methods summary, bank (name/branch/type/number/holder EN+JA), domestic ¥1,000 fee, PH/LBC rates, max gadgets/order, legal name (Yehey Japan K.K.), office/warehouse address (EN+JA), phone(s).

**STOP and show Joey the table. Do not write the seed until he corrects/approves the values** (the design explicitly calls for this review — stale prose values must not be seeded blindly).

- [ ] **Step 3: Write the seed migration**

Create `supabase/migrations/20260702140000_company_facts_seed.sql` with the confirmed rows. Template (fill from the approved table; `sort_order` increments within a category; omit `value_ja` where not applicable):

```sql
-- Seed structured company facts from confirmed live values (reviewed by Joey 2026-07-02).
INSERT INTO company_facts (key, label, value_en, value_ja, category, sort_order) VALUES
  ('order_number_format', 'Order number format', 'YJ-XXXXXX', NULL, 'Orders', 0),
  ('paypal_account_name', 'PayPal account name', '<CONFIRMED>', NULL, 'Payment', 0),
  ('smartpit_number', 'SmartPit number', '<CONFIRMED>', NULL, 'Payment', 1)
  -- ...remaining confirmed rows...
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 4: Apply the seed migration**

Run: `supabase db push`
Expected: `20260702140000_company_facts_seed` applied.

- [ ] **Step 5: Verify the rows**

Run: `supabase db query "select category, label, value_en from company_facts order by category, sort_order;"`
Expected: the confirmed facts listed, grouped by category.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260702140000_company_facts_seed.sql
git commit -m "feat(messaging): seed company_facts with confirmed live values"
```

---

## Task 9: Deploy edge functions, version bump, ship

**Files:**
- Modify: `package.json` (version bump)
- Modify: `docs/PROJECT_STATE.md` (log shipped)

- [ ] **Step 1: Deploy the two consuming edge functions**

The `_shared` change (Tasks 2–3) only takes effect once the functions that import `generate-draft.ts` are redeployed:

```bash
supabase functions deploy generate-pending-drafts
supabase functions deploy test-ai-reply
```

Expected: both deploy successfully.

- [ ] **Step 2: Smoke-test in the Test Playground**

In the admin Messaging Settings → Test Playground, send a message that should surface a fact (e.g. "what's your PayPal account name?" or "what's the order number format?"). Confirm the reply uses the seeded value, and that the built system prompt (if inspectable) contains the `# Company Facts` block.

- [ ] **Step 3: Bump the version**

Bump `package.json` version (semver minor — new feature). This is the once-per-session bump.

- [ ] **Step 4: Update PROJECT_STATE.md**

Move the "Company Info structured facts" item from **NEXT UP** to **Recently shipped**, noting: new `company_facts` table, loader + prompt render, admin "Company Facts" section, seeded values, edge fns redeployed.

- [ ] **Step 5: Ship**

Use the `push-to-main` skill (commits remaining changes + pushes → Vercel auto-deploy).

---

## Self-Review Notes

- **Spec coverage:** table (T1) · prompt render after persona (T2) · loader (T3) · TS types (T4) · service (T5) · keys+hooks (T6) · admin UI grouped by category with EN/JA + reorder/toggle + auto-key form (T7) · seed from confirmed live values (T8) · deploy + playground parity via same generate-draft path (T9). All spec sections mapped.
- **Type consistency:** `CompanyFact` fields (`key/label/value_en/value_ja/category/sort_order/is_active`) are identical across the edge type (T2, no `id`/timestamps — render-only), the frontend type (T4, full row), service (T5), hooks (T6), and UI (T7). The edge `CompanyFact` intentionally omits `id`/`sort_order`/timestamps it doesn't render, but the loader's `select` includes `sort_order` for ordering — harmless extra field, matches the existing `SpecialistRow` casting style.
- **Out of scope (confirmed):** no template/KB `{{variable}}` substitution; existing prose untouched.
