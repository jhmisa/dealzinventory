# AI Ops Harness — Design Spec

**Date:** 2026-07-13
**Status:** Approved (Joey approved the design conversationally and delegated execution)
**Slice:** 1 of N — foundation + messaging replies

## Goal

Let Joey point his **Claude Code (Max) subscription** at a folder in this repo and get a
safe, capable "senior operator" for the Dealz business: it surveys what needs doing,
reasons hard about escalated customer conversations, and **proposes** replies (later:
orders, invoices, inventory intake) into an in-app review queue — the **AI Operations**
cockpit — where staff approve, edit, or reject. Nothing customer-facing or
data-mutating happens without approval until a capability is explicitly graduated to AUTO.

The flat-rate subscription becomes the brain for hard cases; the existing per-token
in-app messaging AI keeps handling the easy ones. Positioning: **the Ops agent handles
what the in-app AI escalates** (`conversations.needs_human_review = true`), it does not
compete with it.

## Non-goals (this slice)

- Orders/invoices/inventory capabilities (future slices reuse the same proposal queue).
- ChatGPT connector (the MCP server is standard; wiring ChatGPT is config, later).
- Embedding-based correction retrieval in the MCP server (recent-N + keyword is enough for v1).
- Realtime cockpit updates (poll via TanStack Query `refetchInterval`).

## Architecture — five pieces

### 1. Operator workspace — `ops/`

The folder Joey opens with Claude Code. Contents:

- **`CLAUDE.md`** — the operator charter: role ("senior operator working the escalation
  queue"), how to work (`survey_worklist` → investigate → `propose_reply`), tone rules
  (English + emojis for Filipino customers, no Markdown in outbound text), escalation
  rules (when NOT to propose), and hard prohibitions.
- **`.mcp.json`** — connects the `dealz-ops` MCP server (stdio, `npx tsx server/src/index.ts`).
- **`.claude/settings.json`** — locked permission profile:
  - `deny`: all `Bash`, `Edit`/`Write` outside `ops/notes/`, `WebFetch`/`WebSearch` optional-allow.
  - Effect: the agent's *native* tools cannot touch the repo, the filesystem, or a shell.
    "Delete all files" is structurally impossible, not merely discouraged.
- **`notes/`** — the agent's only writable scratch space (gitignored).
- **`playbooks/`** — pointer doc referencing the DB-held specialist playbooks
  (fetched live via MCP, not duplicated).

### 2. `dealz-ops` MCP server — `ops/server/` (Node/TS, `@modelcontextprotocol/sdk`, stdio)

**Read tools** (whitelisted queries only, via a single data-access module):

| Tool | Source |
|---|---|
| `survey_worklist` | `conversations` where `needs_human_review = true` (+ pending proposal counts) |
| `get_conversation` | last N `messages` for a conversation + conversation meta |
| `get_customer_context` | customer row + active/recent orders + kaitori requests |
| `search_inventory` | existing inventory-search RPCs (same ones `_shared/inventory-search.ts` calls) |
| `get_item_specs` | existing `get_item_full_specs` RPC |
| `get_correction_examples` | recent approved `ai_corrections` (optional keyword filter) |
| `list_proposals` | `ai_ops_proposals` (own queue visibility) |

**Write tool (the only one):** `propose_reply(conversation_id, content, summary, rationale, confidence)`
→ inserts a `PENDING` row in `ai_ops_proposals`. One pending reply proposal per
conversation (re-proposing replaces it).

**Guardrail middleware wrapping every tool call:**
1. Kill-switch check — `system_settings.ai_ops_enabled` must be `'true'` for any tool;
   writes additionally require capability autonomy ≠ `OFF`.
2. Audit — every call logged to `ai_ops_activity` (tool, arg summary, result summary).
3. Whitelist-by-absence — no SQL tool, no delete tool, no shell. The data-access module
   is the only DB surface and enumerates every allowed query.

Server credentials: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` loaded from the repo
root `.env.local` (server runs only on Joey's machine). Safety comes from the tool
whitelist + kill-switch + audit, not from key scoping (v1 tradeoff, documented).

### 3. Database — one migration

- **`ai_ops_proposals`**: `id`, `type` (`'reply'` for now, open enum via CHECK),
  `status` (`PENDING | APPROVED | REJECTED | EXECUTED | FAILED`), `summary`,
  `rationale`, `confidence numeric`, `payload jsonb` (for `reply`:
  `{conversation_id, content}`), `target_ref text` (conversation id; executed message id
  after execution), `error`, `created_by` (default `'ops-agent'`), `reviewed_by`,
  `reviewed_at`, `executed_at`, `created_at`. Partial unique index: one `PENDING`
  `reply` per conversation. RLS: `authenticated` + `service_role` full.
- **`ai_ops_activity`**: `id bigserial`, `tool`, `args jsonb`, `result_summary text`,
  `proposal_id uuid null`, `created_at`. RLS: `authenticated` read, `service_role` full.
- **`system_settings` seeds**: `ai_ops_enabled = 'true'` (kill-switch),
  `ai_ops_autonomy_reply = 'PROPOSE'` (dial: `OFF | PROPOSE | AUTO`).
- Explicit `GRANT`s per the post-Oct-2026 convention.

### 4. Execution — one new edge function: `ai-ops-execute`

Takes `proposal_id` (+ optional edited `content`), validates: proposal exists, status
`PENDING`/`APPROVED`, kill-switch on, type `reply`. Executes by reusing the **existing
`_shared` send pipeline** (same helper the SEND-autonomy cron path uses — outbound
normalization, Missive API, `needs_human_review` clearing, message row creation), then
stamps the proposal `EXECUTED` with the message id in `target_ref` (or `FAILED` + error).

Callers:
- **Cockpit approve** (staff JWT) — the only caller in v1's default PROPOSE mode.
- **MCP server** (service key) — only when `ai_ops_autonomy_reply = 'AUTO'`; the
  proposal row is still created first, so the audit trail is identical.

One send boundary, already audited, shared by human-approved and (future) auto paths.

### 5. Cockpit — new admin area "AI Operations"

`src/pages/admin/ai-ops.tsx`, route `/admin/ai-ops`, sidebar entry near Messages.

- **Proposals inbox** — cards: summary, confidence, rationale, conversation preview,
  proposed reply (inline-editable). Actions: **Approve & send** (→ `ai-ops-execute`),
  **Reject** (with optional note). Tabs/filter by status.
- **Activity timeline** — reverse-chron feed of `ai_ops_activity`.
- **Controls panel** — kill-switch toggle (`ai_ops_enabled`) and per-capability
  autonomy dial (`reply`: OFF / PROPOSE / AUTO, default PROPOSE; switching to AUTO
  shows an explicit warning).
- Service functions in `src/services/ai-ops.ts`; components in `src/components/ai-ops/`;
  TanStack Query keys `['ai-ops-proposals', filters]`, `['ai-ops-activity']`,
  `['ai-ops-settings']`, `refetchInterval` ~10s on the inbox.

## Safety model (layered, structural)

1. **Capability-by-absence** — the MCP server has no SQL/shell/delete tool.
2. **Native tools locked** — `ops/.claude/settings.json` denies Bash and out-of-notes writes.
3. **Proposals-only default** — the sole write tool produces an inert queue row.
4. **Single audited execution path** — `ai-ops-execute` reuses the existing send pipeline.
5. **Kill-switch + full audit** — one toggle halts everything; every call is logged.
6. **Reversibility** — git tag `pre-ai-ops-v1.106.0` on origin marks the pre-feature state;
   the feature itself mutates nothing until a human approves (in PROPOSE mode).

## A worked run

1. Joey opens `ops/` in Claude Code: "work the queue" (or `/loop`).
2. Agent: `survey_worklist` → 6 escalated conversations.
3. Per conversation: `get_conversation` + `get_customer_context` (+ `search_inventory`,
   `get_item_specs`, `get_correction_examples` as needed) → `propose_reply`.
4. Six cards appear in **AI Operations** on Joey's phone.
5. Approve 4, edit 1, reject 1 → approved ones send through the normal Missive path,
   conversations leave the Action Required queue, everything is in the activity log.

## Future slices (same pattern, out of scope now)

Orders & invoices → inventory intake → per-capability AUTO graduation with confidence
thresholds (mirroring `messaging_sub_intents`). Each adds proposal `type`s + tools +
cockpit card renderers; the queue, harness, cockpit, and execution pattern don't change.
