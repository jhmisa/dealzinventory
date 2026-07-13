# AI Ops Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 1 of the AI Ops Harness — an `ops/` folder Joey opens with Claude Code (Max) that exposes whitelisted business tools via a local MCP server; the agent proposes customer replies into a new in-app **AI Operations** cockpit where staff approve/edit/reject; execution reuses the existing `_shared/send-via-missive.ts` pipeline via one new `ai-ops-execute` edge function.

**Architecture:** Proposals-only by default (`ai_ops_autonomy_reply='PROPOSE'`), kill-switch (`ai_ops_enabled`), every tool call audited to `ai_ops_activity`. The MCP server (`ops/server/`, Node/TS, stdio) has NO SQL/shell/delete tools — its only write inserts an inert `ai_ops_proposals` row. Spec: `docs/superpowers/specs/2026-07-13-ai-ops-harness-design.md`.

**Tech Stack:** `@modelcontextprotocol/sdk` + `@supabase/supabase-js` + `tsx` (server); Supabase migration + Deno edge fn; React + TanStack Query + shadcn (cockpit).

**Restore point:** git tag `pre-ai-ops-v1.106.0` (on origin). Branch: `feat/ai-ops`.

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260713000000_ai_ops.sql` | proposals + activity tables, RLS/grants, settings seeds |
| `ops/server/package.json`, `tsconfig.json` | standalone server package |
| `ops/server/src/env.ts` | load repo-root `.env.local`, export creds |
| `ops/server/src/lib.ts` (+`lib.test.ts`) | pure helpers: `truncate`, `ageLabel` |
| `ops/server/src/db.ts` | THE whitelisted data-access surface (all queries live here) |
| `ops/server/src/guardrails.ts` | kill-switch/autonomy check + activity logging wrapper |
| `ops/server/src/index.ts` | MCP stdio server, 8 tool registrations |
| `ops/server/src/smoke.ts` | live smoke: reads + propose + cleanup |
| `ops/CLAUDE.md` | operator charter |
| `ops/.mcp.json` | wires dealz-ops server |
| `ops/.claude/settings.json` | locked native-tool permissions |
| `ops/notes/.gitkeep`, `ops/playbooks/README.md` | scratch space + playbook pointer |
| `supabase/functions/ai-ops-execute/index.ts` | single execution path (reuses `sendViaMissive`) |
| `src/lib/types.ts` | `AiOpsProposal` / `AiOpsActivity` aliases (hand-maintained) |
| `src/lib/query-keys.ts` | `aiOps` keys |
| `src/services/ai-ops.ts` | frontend service |
| `src/hooks/use-ai-ops.ts` | TanStack hooks |
| `src/components/ai-ops/{proposal-card,activity-feed,ops-controls,index}.tsx` | cockpit UI units |
| `src/pages/admin/ai-ops.tsx` | cockpit page |
| `src/routes.tsx`, `src/components/layout/sidebar.tsx` | route + nav |

---

### Task 1: Migration — `ai_ops_proposals`, `ai_ops_activity`, settings

**Files:** Create `supabase/migrations/20260713000000_ai_ops.sql`

- [x] **Step 1.1: Write the migration**

```sql
-- AI Ops Harness (slice 1): proposals queue + activity audit + settings.
-- Spec: docs/superpowers/specs/2026-07-13-ai-ops-harness-design.md

CREATE TABLE ai_ops_proposals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('reply')),
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED')),
  summary      text NOT NULL,
  rationale    text,
  confidence   numeric CHECK (confidence >= 0 AND confidence <= 1),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_ref   text,           -- conversation id at propose time; sent message id after execution
  error        text,
  created_by   text NOT NULL DEFAULT 'ops-agent',
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note  text,
  reviewed_at  timestamptz,
  executed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_ops_proposals_status ON ai_ops_proposals(status, created_at DESC);
-- One live reply proposal per conversation (re-propose replaces, enforced in code; this backstops it).
CREATE UNIQUE INDEX idx_ai_ops_one_pending_reply_per_conv
  ON ai_ops_proposals ((payload->>'conversation_id'))
  WHERE status = 'PENDING' AND type = 'reply';

ALTER TABLE ai_ops_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access ai_ops_proposals" ON ai_ops_proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access ai_ops_proposals" ON ai_ops_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON ai_ops_proposals TO authenticated, service_role;
REVOKE ALL ON ai_ops_proposals FROM anon;

CREATE TABLE ai_ops_activity (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool           text NOT NULL,
  args           jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  proposal_id    uuid REFERENCES ai_ops_proposals(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_ops_activity_created ON ai_ops_activity(created_at DESC);
ALTER TABLE ai_ops_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ai_ops_activity" ON ai_ops_activity
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access ai_ops_activity" ON ai_ops_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON ai_ops_activity TO authenticated;
GRANT ALL ON ai_ops_activity TO service_role;
REVOKE ALL ON ai_ops_activity FROM anon;

INSERT INTO system_settings (key, value) VALUES
  ('ai_ops_enabled', 'true'),
  ('ai_ops_autonomy_reply', 'PROPOSE')
ON CONFLICT (key) DO NOTHING;
```

- [x] **Step 1.2: Apply via CLI** — `supabase db push` (auto-apply per CLAUDE.md). Expected: migration applied, no errors.
- [x] **Step 1.3: Verify remotely** — `supabase migration list | tail -3` shows `20260713000000` on remote; quick `execute_sql`-equivalent check via `psql`/CLI that both tables exist and the two settings rows are seeded.
- [x] **Step 1.4: Regenerate `database.types.ts` ONLY** (`supabase gen types typescript --linked > src/lib/database.types.ts`). NEVER regenerate `src/lib/types.ts` (hand-maintained — memory `project_types_file_structure`).
- [x] **Step 1.5: Add hand aliases to `src/lib/types.ts`** (match file style — no semicolons, single quotes):

```ts
// ---- AI Ops (harness) ----
export type AiOpsProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED'
export type AiOpsAutonomy = 'OFF' | 'PROPOSE' | 'AUTO'

export interface AiOpsProposal {
  id: string
  type: 'reply'
  status: AiOpsProposalStatus
  summary: string
  rationale: string | null
  confidence: number | null
  payload: { conversation_id?: string; content?: string } & Record<string, unknown>
  target_ref: string | null
  error: string | null
  created_by: string
  reviewed_by: string | null
  review_note: string | null
  reviewed_at: string | null
  executed_at: string | null
  created_at: string
}

export interface AiOpsActivity {
  id: number
  tool: string
  args: Record<string, unknown>
  result_summary: string | null
  proposal_id: string | null
  created_at: string
}
```

- [x] **Step 1.6: Commit** — `git add supabase/migrations/20260713000000_ai_ops.sql src/lib/database.types.ts src/lib/types.ts && git commit -m "feat(ai-ops): proposals + activity tables, kill-switch + autonomy settings"`

---

### Task 2: One-time — service-role key for the local server

`.env.local` currently has no `SUPABASE_SERVICE_ROLE_KEY`.

- [x] **Step 2.1:** Get the key: `supabase projects api-keys --project-ref <ref from supabase/config.toml or .temp/project-ref>` and append `SUPABASE_SERVICE_ROLE_KEY=<key>` to `.env.local` (gitignored — verify with `git check-ignore .env.local`).
- [x] **Step 2.2:** Confirm `.env.local` is NOT staged/committed. No commit for this task.

---

### Task 3: MCP server — package + pure helpers (TDD)

**Files:** Create `ops/server/package.json`, `ops/server/tsconfig.json`, `ops/server/src/lib.ts`, `ops/server/src/lib.test.ts`

- [x] **Step 3.1: package scaffold**

`ops/server/package.json`:
```json
{
  "name": "dealz-ops-server",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "smoke": "tsx src/smoke.ts",
    "test": "tsx src/lib.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@supabase/supabase-js": "^2.50.0",
    "dotenv": "^16.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

`ops/server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [x] **Step 3.2: Failing test** — `ops/server/src/lib.test.ts` (node:assert style, mirrors repo tests):

```ts
import assert from 'node:assert/strict'
import { truncate, ageLabel } from './lib.js'

assert.equal(truncate('hello', 10), 'hello')
assert.equal(truncate('a'.repeat(400)), 'a'.repeat(299) + '…')
assert.equal(truncate('abcdef', 4), 'abc…')

const now = new Date('2026-07-13T12:00:00Z')
assert.equal(ageLabel(null, now), '—')
assert.equal(ageLabel('2026-07-13T11:30:00Z', now), '30m')
assert.equal(ageLabel('2026-07-13T08:00:00Z', now), '4h')
assert.equal(ageLabel('2026-07-10T12:00:00Z', now), '3d')

console.log('lib tests passed')
```

- [x] **Step 3.3:** `cd ops/server && npm install && npm test` → FAIL (lib.ts missing).
- [x] **Step 3.4: Implement** `ops/server/src/lib.ts`:

```ts
/** Clamp a string for audit logs / snippets; appends an ellipsis when cut. */
export function truncate(text: string, max = 300): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

/** Compact age label for worklist rows: 30m / 4h / 3d. */
export function ageLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—'
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
```

- [x] **Step 3.5:** `npm test` → PASS. `npm run typecheck` → clean.
- [x] **Step 3.6: Commit** — `git add ops/server && git commit -m "feat(ai-ops): dealz-ops server scaffold + pure helpers (tested)"` (verify `ops/server/node_modules` is gitignored; add `ops/server/node_modules/` to root `.gitignore` if not covered).

---

### Task 4: MCP server — env, data access, guardrails, server, smoke

**Files:** Create `ops/server/src/env.ts`, `ops/server/src/db.ts`, `ops/server/src/guardrails.ts`, `ops/server/src/index.ts`, `ops/server/src/smoke.ts`

- [x] **Step 4.1:** `ops/server/src/env.ts`:

```ts
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ops/server/src → repo root is three levels up. The server runs ONLY on Joey's machine.
const here = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(here, '../../../.env.local') })

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('dealz-ops: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in repo-root .env.local')
  process.exit(1)
}
```

- [x] **Step 4.2:** `ops/server/src/db.ts` — the ONLY database surface. Every query the agent can trigger is enumerated here; nothing generic, nothing destructive. Key functions (full implementations, not sketches):

```ts
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SERVICE_ROLE_KEY } from './env.js'
import { truncate, ageLabel } from './lib.js'

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.value ?? null
}

/** Escalated conversations (needs_human_review) with customer name + last message snippet. */
export async function surveyWorklist(limit = 25) {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, customer_id, channel, last_message_at, created_at, customers(customer_code, last_name, first_name)')
    .eq('needs_human_review', true)
    .order('last_message_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  const now = new Date()
  const out = []
  for (const c of convs ?? []) {
    const { data: last } = await supabase
      .from('messages').select('role, content, created_at')
      .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const { count } = await supabase
      .from('ai_ops_proposals').select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING').eq('type', 'reply').eq('payload->>conversation_id', c.id)
    const cust = c.customers as { customer_code?: string; last_name?: string; first_name?: string } | null
    out.push({
      conversation_id: c.id,
      customer: cust ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim() || cust.customer_code : '(unmatched contact)',
      waiting: ageLabel(c.last_message_at, now),
      last_message: last ? `[${last.role}] ${truncate(last.content ?? '', 160)}` : '(no messages)',
      has_pending_proposal: (count ?? 0) > 0,
    })
  }
  return out
}

export async function getConversation(conversationId: string, limit = 30) { /* conversation meta + last N messages (role, content, status, ai fields, created_at), chronological */ }
export async function getCustomerContext(conversationId: string) { /* conversation → customer row (code/name/email/phone/is_seller) + last 5 orders (order_code, status, total_amount, created_at) + last 3 kaitori_requests (kaitori_code, status) */ }
export async function searchInventory(query: string, opts: { brand?: string; price_min?: number; price_max?: number }) { /* the 3 RPCs `search_available_inventory` / `search_available_sell_groups` / `search_available_backorder_lines` with { search_query, result_limit: 10, filter_brand, filter_category_id: null, price_min, price_max } — map minimal fields (code, description, grade, price, count) */ }
export async function getItemSpecs(codeOrQuery: string) { /* rpc get_item_full_specs — mirror _shared/item-specs.ts param usage exactly (read that file first) */ }
export async function getCorrections(keyword: string | undefined, limit = 10) { /* ai_corrections status IN (APPROVED, PROMOTED), optional ilike on customer_message, newest first, return customer_message/correct_reply/note */ }
export async function listProposals(status?: string) { /* ai_ops_proposals newest 50, optional status filter */ }

/** The ONLY write: upsert-replace the single PENDING reply proposal for a conversation. */
export async function proposeReply(p: {
  conversation_id: string; content: string; summary: string; rationale?: string; confidence?: number
}) {
  // conversation must exist (fail loud, not silent)
  const { data: conv, error: convErr } = await supabase
    .from('conversations').select('id').eq('id', p.conversation_id).maybeSingle()
  if (convErr) throw new Error(convErr.message)
  if (!conv) throw new Error(`Conversation not found: ${p.conversation_id}`)
  const row = {
    type: 'reply', status: 'PENDING', summary: p.summary, rationale: p.rationale ?? null,
    confidence: p.confidence ?? null, created_by: 'ops-agent',
    payload: { conversation_id: p.conversation_id, content: p.content },
    target_ref: p.conversation_id,
  }
  const { data: existing } = await supabase
    .from('ai_ops_proposals').select('id')
    .eq('status', 'PENDING').eq('type', 'reply')
    .eq('payload->>conversation_id', p.conversation_id).maybeSingle()
  if (existing) {
    const { data, error } = await supabase.from('ai_ops_proposals')
      .update(row).eq('id', existing.id).select('id').single()
    if (error) throw new Error(error.message)
    return { proposal_id: data.id, replaced: true }
  }
  const { data, error } = await supabase.from('ai_ops_proposals').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return { proposal_id: data.id, replaced: false }
}

export async function logActivity(tool: string, args: Record<string, unknown>, resultSummary: string, proposalId?: string) {
  await supabase.from('ai_ops_activity').insert({
    tool, args, result_summary: truncate(resultSummary, 500), proposal_id: proposalId ?? null,
  })
}
```

(The `/* ... */` bodies above are shorthand for THIS PLAN ONLY because they are straightforward selects fully specified by the comment — implement them as described, mirroring the `_shared` sources named in each comment.)

- [x] **Step 4.3:** `ops/server/src/guardrails.ts`:

```ts
import { getSetting, logActivity } from './db.js'

export class OpsBlockedError extends Error {}

/** Wrap every tool: kill-switch gate (all tools) + autonomy gate (writes) + audit log. */
export async function runTool<T>(
  name: string,
  args: Record<string, unknown>,
  opts: { write?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const enabled = await getSetting('ai_ops_enabled')
  if (enabled !== 'true') {
    await logActivity(name, args, 'BLOCKED: kill-switch off')
    throw new OpsBlockedError('AI Ops is disabled (kill-switch). A staff member must re-enable it in the AI Operations page.')
  }
  if (opts.write) {
    const autonomy = await getSetting('ai_ops_autonomy_reply')
    if (autonomy === 'OFF') {
      await logActivity(name, args, 'BLOCKED: reply capability is OFF')
      throw new OpsBlockedError('The reply capability is set to OFF. A staff member must raise it to PROPOSE in the AI Operations page.')
    }
  }
  try {
    const result = await fn()
    await logActivity(name, args, summarize(result), extractProposalId(result))
    return result
  } catch (err) {
    if (!(err instanceof OpsBlockedError)) {
      await logActivity(name, args, `ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
    throw err
  }
}

function summarize(result: unknown): string {
  if (Array.isArray(result)) return `ok (${result.length} rows)`
  if (result && typeof result === 'object') return `ok ${JSON.stringify(result).slice(0, 200)}`
  return 'ok'
}
function extractProposalId(result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'proposal_id' in result) {
    return (result as { proposal_id?: string }).proposal_id
  }
  return undefined
}
```

- [x] **Step 4.4:** `ops/server/src/index.ts` — register the 8 tools on `McpServer` (name `dealz-ops`), each handler = `runTool(name, args, {write}, () => db.fn(...))`, result returned as `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`; errors returned as `{ content: [{type:'text', text: 'ERROR: …'}], isError: true }`. Tools + descriptions (descriptions are agent-facing — make them operational):
  - `survey_worklist` — "List escalated customer conversations awaiting the senior operator, oldest first. Start here."
  - `get_conversation` — `{ conversation_id, limit? }`
  - `get_customer_context` — `{ conversation_id }`
  - `search_inventory` — `{ query, brand?, price_min?, price_max? }` — "Search available stock (items, groups, backorders). Prices in JPY."
  - `get_item_specs` — `{ code_or_query }`
  - `get_correction_examples` — `{ keyword?, limit? }` — "Staff-approved examples of correct replies. Consult before proposing."
  - `list_proposals` — `{ status? }`
  - `propose_reply` (write) — `{ conversation_id, content, summary, rationale?, confidence? }` — "Submit a reply PROPOSAL for staff review. Plain text only (no Markdown — Messenger renders it literally). English + light emojis. This does NOT send anything."
  - **AUTO mode:** after a successful propose, if `getSetting('ai_ops_autonomy_reply') === 'AUTO'`, POST `${SUPABASE_URL}/functions/v1/ai-ops-execute` with headers `Authorization: Bearer ${SERVICE_ROLE_KEY}`, `apikey: ${SERVICE_ROLE_KEY}` and body `{ proposal_id }`; append the execute result to the tool output. In PROPOSE mode, skip.
  - Transport: `StdioServerTransport`; wrap `logActivity` failures in try/catch so audit hiccups never crash the server.
- [x] **Step 4.5:** `ops/server/src/smoke.ts` — live smoke (reads are harmless; the write is inert and cleaned up):

```ts
import { surveyWorklist, getConversation, searchInventory, proposeReply, listProposals, supabase } from './db.js'

const work = await surveyWorklist(5)
console.log('worklist:', work.length, 'rows')
if (work.length > 0) {
  const conv = await getConversation(work[0].conversation_id, 5)
  console.log('conversation ok:', conv.messages.length, 'messages')
}
const inv = await searchInventory('iphone 12', {})
console.log('inventory:', inv.length, 'results')

// Inert write + cleanup — needs at least one conversation to exist
const { data: anyConv } = await supabase.from('conversations').select('id').limit(1).single()
const res = await proposeReply({
  conversation_id: anyConv!.id,
  content: 'SMOKE TEST — do not send',
  summary: 'smoke test proposal',
  confidence: 0.5,
})
console.log('proposed:', res)
const listed = await listProposals('PENDING')
console.log('pending visible:', listed.some((p: { id: string }) => p.id === res.proposal_id))
await supabase.from('ai_ops_proposals').delete().eq('id', res.proposal_id)
console.log('cleaned up. SMOKE PASSED')
```

- [x] **Step 4.6:** Run `npm run smoke` (in `ops/server`) → `SMOKE PASSED`; `npm run typecheck` → clean.
- [x] **Step 4.7: Commit** — `git commit -m "feat(ai-ops): dealz-ops MCP server — 7 read tools + propose_reply behind guardrails"`

---

### Task 5: Operator workspace — `ops/`

**Files:** Create `ops/CLAUDE.md`, `ops/.mcp.json`, `ops/.claude/settings.json`, `ops/notes/.gitkeep`, `ops/playbooks/README.md`; modify root `.gitignore`

- [x] **Step 5.1:** `ops/.mcp.json`:

```json
{
  "mcpServers": {
    "dealz-ops": {
      "command": "npx",
      "args": ["tsx", "./server/src/index.ts"]
    }
  }
}
```

- [x] **Step 5.2:** `ops/.claude/settings.json` — deny native power; allow scratch notes:

```json
{
  "permissions": {
    "deny": [
      "Bash",
      "Edit",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "Read(./server/**)",
      "Read(../.env*)",
      "Read(//Users/joeymisa/Documents/Projects/inventory-claude/.env*)"
    ],
    "allow": [
      "Write(./notes/**)"
    ]
  }
}
```

(Deny wins over allow in Claude Code permission rules; writes outside `notes/` fall back to ask-mode prompts Joey will see. `Read` denies keep the service key and server internals out of the operator's context.)

- [x] **Step 5.3:** `ops/CLAUDE.md` — the charter. Full text (agent-facing; written for a Claude Code session whose ONLY tools are the dealz-ops MCP tools + notes):

```markdown
# Dealz Senior Operator — Charter

You are the senior operator for Dealz K.K., a refurb-device resale business in Japan.
You work the ESCALATION QUEUE: conversations the in-app AI flagged for human review.
Your output is PROPOSALS — staff approve, edit, or reject them in the AI Operations page.
You never send anything to a customer directly.

## How to work (the loop)
1. `survey_worklist` — see who is waiting (oldest first).
2. For each conversation: `get_conversation` → `get_customer_context` →
   (`search_inventory` / `get_item_specs` / `get_correction_examples` as needed).
3. When you are confident in a reply: `propose_reply` with an honest `confidence` (0–1)
   and a `rationale` staff can check at a glance.
4. If a conversation needs something you CANNOT do (refunds, order edits, promises about
   repairs, anything not covered by your tools): do NOT propose. Note it in
   `notes/escalations.md` instead, with the conversation id and what a human must decide.
5. Repeat until the worklist is empty, then summarize what you did.

## Reply rules
- Customers are Filipino — write in ENGLISH with light, warm emojis. Never Japanese.
- PLAIN TEXT ONLY. No Markdown (no **bold**, no [links](…)) — Messenger renders it literally.
- Prices in ¥ (JPY). Quote exact codes (P/G/B) and prices from `search_inventory` — never
  invent stock, prices, or delivery promises.
- Consult `get_correction_examples` before proposing — staff corrections are ground truth
  for tone and policy.
- One proposal per conversation; re-proposing replaces your earlier pending proposal.

## Hard prohibitions
- Never claim an order/refund/change has been made — you cannot make them (yet).
- Never propose replies about ID verification, bank details, or legal matters — escalate.
- Never work around a blocked tool. If the kill-switch is on, stop and say so.
- Your only writable space is `notes/`. Everything else is off-limits by design.
```

- [x] **Step 5.4:** `ops/playbooks/README.md` — one paragraph: playbooks live in the DB (`messaging_specialists.playbook`); the correction examples tool surfaces the operational ground truth; this folder is reserved for future static playbooks. `ops/notes/.gitkeep` empty; root `.gitignore` gains `ops/notes/*` + `!ops/notes/.gitkeep` + `ops/server/node_modules/` (if root ignore lacks a global `node_modules` rule — check first).
- [x] **Step 5.5: Verify the harness bites:** run `claude --print` (or manual check) is NOT required — instead verify statically: `.mcp.json` valid JSON, settings valid JSON, and `npx tsx ./server/src/index.ts` starts from `ops/` without crashing (Ctrl-C after "running on stdio" style output; test with an `echo … |` initialize message if needed).
- [x] **Step 5.6: Commit** — `git commit -m "feat(ai-ops): ops/ operator workspace — charter, locked permissions, MCP wiring"`

---

### Task 6: `ai-ops-execute` edge function

**Files:** Create `supabase/functions/ai-ops-execute/index.ts`

- [x] **Step 6.1: Implement** (always-200 JSON pattern like `send-message`; reuses `sendViaMissive`):

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaMissive } from "../_shared/send-via-missive.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const body = await req.json().catch(() => null);
    if (!body?.proposal_id) return json({ error: 'proposal_id is required' });

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Reviewer identity: present when the cockpit (staff JWT) calls; absent for AUTO (service key).
    let reviewedBy: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await caller.auth.getUser();
      reviewedBy = data?.user?.id ?? null;
    }

    // Kill-switch — the single gate every execution passes through.
    const { data: ks } = await service.from('system_settings').select('value').eq('key', 'ai_ops_enabled').maybeSingle();
    if (ks?.value !== 'true') return json({ error: 'AI Ops is disabled (kill-switch)' });

    const { data: proposal, error: pErr } = await service
      .from('ai_ops_proposals').select('*').eq('id', body.proposal_id).maybeSingle();
    if (pErr || !proposal) return json({ error: `Proposal not found: ${pErr?.message ?? body.proposal_id}` });
    if (!['PENDING', 'APPROVED'].includes(proposal.status)) {
      return json({ error: `Proposal is ${proposal.status}, not executable` });
    }
    if (proposal.type !== 'reply') return json({ error: `Unsupported proposal type: ${proposal.type}` });

    const conversationId = proposal.payload?.conversation_id as string | undefined;
    const content = (body.content as string | undefined) ?? (proposal.payload?.content as string | undefined);
    if (!conversationId || !content) return json({ error: 'Proposal payload is missing conversation_id or content' });

    // Persist an edited body onto the proposal BEFORE sending, so the record shows what went out.
    if (body.content && body.content !== proposal.payload?.content) {
      await service.from('ai_ops_proposals')
        .update({ payload: { ...proposal.payload, content: body.content } })
        .eq('id', proposal.id);
    }

    const result = await sendViaMissive(service, {
      conversationId,
      content,
      sentBy: reviewedBy,
      autoSent: !reviewedBy,
    });

    const now = new Date().toISOString();
    if (!result.ok) {
      await service.from('ai_ops_proposals').update({
        status: 'FAILED', error: result.error ?? 'send failed',
        reviewed_by: reviewedBy, reviewed_at: now,
      }).eq('id', proposal.id);
      return json({ error: result.error ?? 'send failed' });
    }
    await service.from('ai_ops_proposals').update({
      status: 'EXECUTED', executed_at: now, reviewed_by: reviewedBy, reviewed_at: now,
      target_ref: result.messageId ?? conversationId, error: null,
    }).eq('id', proposal.id);
    await service.from('ai_ops_activity').insert({
      tool: 'execute_proposal', args: { proposal_id: proposal.id, edited: !!body.content },
      result_summary: `sent message ${result.messageId}`, proposal_id: proposal.id,
    });
    return json({ ok: true, message_id: result.messageId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' });
  }
});
```

- [x] **Step 6.2:** `deno check supabase/functions/ai-ops-execute/index.ts` → clean. Deploy: `supabase functions deploy ai-ops-execute`.
- [x] **Step 6.3: Verify inert paths live** (no customer contact): invoke with `{}` → `{error: 'proposal_id is required'}`; invoke with a random uuid → "Proposal not found"; flip `ai_ops_enabled` to `'false'`, invoke with a real pending smoke proposal → "disabled (kill-switch)", flip back to `'true'`, delete the smoke proposal. NEVER execute a real send in verification (that messages a real customer — same rule as Blotato).
- [x] **Step 6.4: Commit** — `git commit -m "feat(ai-ops): ai-ops-execute edge fn — single execution path via sendViaMissive"`

---

### Task 7: Frontend service + hooks

**Files:** Modify `src/lib/query-keys.ts`; create `src/services/ai-ops.ts`, `src/hooks/use-ai-ops.ts`

- [x] **Step 7.1:** query-keys — add (mirroring existing style):

```ts
aiOps: {
  all: ['ai-ops'] as const,
  proposals: (status?: string) => ['ai-ops', 'proposals', status ?? 'all'] as const,
  activity: () => ['ai-ops', 'activity'] as const,
  settings: () => ['ai-ops', 'settings'] as const,
},
```

- [x] **Step 7.2:** `src/services/ai-ops.ts`:

```ts
import { supabase } from '@/lib/supabase'
import type { AiOpsProposal, AiOpsActivity, AiOpsProposalStatus } from '@/lib/types'
import { updateSystemSetting } from './settings'

export async function getAiOpsProposals(status?: AiOpsProposalStatus) {
  let q = supabase.from('ai_ops_proposals').select('*').order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AiOpsProposal[]
}

export async function getAiOpsActivity(limit = 100) {
  const { data, error } = await supabase
    .from('ai_ops_activity').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as AiOpsActivity[]
}

export async function rejectAiOpsProposal(id: string, note?: string) {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('ai_ops_proposals').update({
    status: 'REJECTED',
    review_note: note ?? null,
    reviewed_by: userData?.user?.id ?? null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'PENDING')
  if (error) throw error
}

/** Approve = execute through the single audited path. Optional edited content. */
export async function approveAiOpsProposal(id: string, content?: string) {
  const { data, error } = await supabase.functions.invoke('ai-ops-execute', {
    body: { proposal_id: id, ...(content ? { content } : {}) },
  })
  if (error) throw new Error(data?.error ?? error.message ?? 'Execute failed')
  if (data?.error) throw new Error(data.error)
  return data as { ok: true; message_id: string }
}

export interface AiOpsSettings { enabled: boolean; replyAutonomy: 'OFF' | 'PROPOSE' | 'AUTO' }

export async function getAiOpsSettings(): Promise<AiOpsSettings> {
  const { data, error } = await supabase
    .from('system_settings').select('key, value')
    .in('key', ['ai_ops_enabled', 'ai_ops_autonomy_reply'])
  if (error) throw error
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return {
    enabled: map.ai_ops_enabled === 'true',
    replyAutonomy: (map.ai_ops_autonomy_reply ?? 'PROPOSE') as AiOpsSettings['replyAutonomy'],
  }
}

export async function setAiOpsEnabled(enabled: boolean) {
  await updateSystemSetting('ai_ops_enabled', enabled ? 'true' : 'false')
}
export async function setAiOpsReplyAutonomy(level: AiOpsSettings['replyAutonomy']) {
  await updateSystemSetting('ai_ops_autonomy_reply', level)
}
```

- [x] **Step 7.3:** `src/hooks/use-ai-ops.ts` — standard TanStack pattern (mirror `use-messaging.ts`): `useAiOpsProposals(status?)` with `refetchInterval: 10_000`, `useAiOpsActivity()`, `useAiOpsSettings()`, and mutations `useApproveAiOpsProposal` / `useRejectAiOpsProposal` / `useSetAiOpsEnabled` / `useSetAiOpsReplyAutonomy` — each invalidating `queryKeys.aiOps.all`, with toast error handling matching the codebase convention.
- [x] **Step 7.4:** `npx tsc --noEmit` → clean. Commit: `git commit -m "feat(ai-ops): frontend service + hooks for proposals, activity, settings"`

---

### Task 8: Cockpit UI — AI Operations page

**Files:** Create `src/components/ai-ops/proposal-card.tsx`, `activity-feed.tsx`, `ops-controls.tsx`, `index.ts`; create `src/pages/admin/ai-ops.tsx`; modify `src/routes.tsx`, `src/components/layout/sidebar.tsx`

- [x] **Step 8.1:** `proposal-card.tsx` — shadcn `Card`: header row (type badge, status badge, confidence pill like `Math.round(confidence*100)%`, relative age); `summary` as title; collapsible `rationale`; proposed reply in an editable `Textarea` (local state, dirty flag → "edited" chip); footer: **Approve & send** (destructive-styled confirm `AlertDialog`: "This sends a real message to the customer") + **Reject** (with optional note `Input`). Props: `{ proposal, onApprove(id, content?), onReject(id, note?), busy }` — presentation-only, mutations live in the page.
- [x] **Step 8.2:** `activity-feed.tsx` — simple list rows: tool name mono-chip, `result_summary`, relative time. Props `{ items }`.
- [x] **Step 8.3:** `ops-controls.tsx` — `Card` with: kill-switch `Switch` (label "AI Ops enabled — master kill-switch"), reply-autonomy `Select` (OFF / PROPOSE / AUTO) with helper text per level and an `AlertDialog` confirm when choosing AUTO ("The agent will send replies WITHOUT review. Are you sure?"). Props: `{ settings, onToggleEnabled, onSetAutonomy, busy }`.
- [x] **Step 8.4:** `src/pages/admin/ai-ops.tsx` — page header ("AI Operations — review what the ops agent proposes; nothing reaches a customer without approval here, while autonomy is PROPOSE"); `OpsControls`; `Tabs`: **Pending** (default, `useAiOpsProposals('PENDING')`, empty-state "Queue is clear 🎉"), **History** (all statuses, read-only cards), **Activity** (`ActivityFeed`). Wire mutations with toasts ("Reply sent to customer" / "Proposal rejected").
- [x] **Step 8.5:** Route: in `src/routes.tsx` add `const AiOpsPage = lazy(() => import('@/pages/admin/ai-ops'))` + `{ path: 'ai-ops', element: lazyElement(AiOpsPage) }` (all-staff, like Messages). Sidebar: in the `Messaging` group add `{ title: 'AI Operations', href: '/admin/ai-ops', icon: Bot }` (import `Bot` from lucide-react).
- [x] **Step 8.6:** `npx tsc --noEmit` && `npm run build` → clean. Commit: `git commit -m "feat(ai-ops): AI Operations cockpit — proposals inbox, activity feed, autonomy controls"`

---

### Task 9: E2E verification (safe — no customer contact)

- [x] **Step 9.1:** Re-run `ops/server`: `npm test` + `npm run smoke` but SKIP the cleanup delete for one proposal (temporarily comment or add `--keep` handling): leave ONE pending smoke proposal in the DB.
- [x] **Step 9.2:** Playwright (dev-staff login from `.env.local`): open `/admin/ai-ops` → controls render (enabled=true, autonomy=PROPOSE); Pending tab shows the smoke proposal card with summary/confidence; edit the textarea → "edited" chip appears; click **Reject** with note → toast, card leaves Pending, appears in History as REJECTED with the note. 0 console errors.
- [x] **Step 9.3:** Kill-switch UX: toggle AI Ops OFF in the UI → run a `survey_worklist` via the server (one-liner script) → expect `OpsBlockedError` text; check Activity tab shows the `BLOCKED: kill-switch off` row; toggle back ON.
- [x] **Step 9.4:** Clean up all smoke artifacts (proposals + their activity rows can stay — they ARE the audit trail; delete only the REJECTED smoke proposal row and its activity rows to leave Joey a clean slate).
- [x] **Step 9.5:** Full gates: `npx tsc --noEmit`, `npm run build`, `cd ops/server && npm run typecheck && npm test`, `deno check supabase/functions/ai-ops-execute/index.ts`.

---

### Task 10: Finalize

- [x] **Step 10.1:** Update `docs/PROJECT_STATE.md` Now-entry: what shipped, what's verified, what's gated on Joey (first real approve→send; flipping AUTO).
- [x] **Step 10.2:** Bump `package.json` → `1.107.0` (one bump this session).
- [x] **Step 10.3:** Final commit on `feat/ai-ops`. Do NOT push to main — outward-facing deploy stays gated on Joey (matches Content Studio precedent). Push the branch to origin for backup: `git push -u origin feat/ai-ops`.

---

## Self-review notes

- **Spec coverage:** workspace (T5), MCP server + guardrails (T3–4), tables/settings (T1), execute fn (T6), cockpit (T7–8), safety verification (T9), restore tag (done pre-plan). ✔
- **Types:** `AiOpsProposal.payload.content`/`conversation_id` used consistently in db.ts, edge fn, service, card. `OpsBlockedError` only in server. ✔
- **No real sends anywhere in verification** — approve path is verified only through its error branches; the happy-path send is Joey's first live approval. ✔

---

## Slice 1.5 addendum — attention scan + briefings (built same day, all done)

- [x] Migration `20260713010000_ai_ops_briefing.sql` — type CHECK += `briefing`, status CHECK += `ACKNOWLEDGED` (applied remotely)
- [x] `db.ts scanAttention()` — 8 fixed read-only categories: unanswered customers (>4h, last msg = customer), stale drafts (>24h), failed sends (7d), open tickets, stuck orders (PENDING>2d / CONFIRMED>5d), backorder units AWAITING_ORDER, kaitori follow-ups (RECEIVED/INSPECTING>2d, PRICE_REVISED>3d, APPROVED unpaid>2d), intake backlog (>3d)
- [x] `db.ts proposeBriefing()` — one live briefing, replace-on-refile; never executable (ai-ops-execute only handles `reply`)
- [x] `index.ts` — `scan_attention` + `propose_briefing` tools registered (10 total), kill-switch gated + audited; briefing NOT gated by reply autonomy (can't reach a customer)
- [x] Cockpit — briefing card (ClipboardList icon, content, single Acknowledge), `acknowledgeAiOpsProposal` service + hook, ACKNOWLEDGED badge
- [x] Charter — "Ad-hoc asks" + "Morning scan" sections
- [x] E2E verified — live scan (43 real findings) → briefing card → Acknowledge → History; 0 console errors; artifacts cleaned; tsc/build/server tests green
