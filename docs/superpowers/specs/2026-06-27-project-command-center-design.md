# Project Command Center — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design) — pending implementation plan
**Author:** Claude + Joey

---

## 1. Problem

The Dealz project has grown large (37 service files, 28 edge functions, domains well beyond the original 15-table PRD). Across sessions, four linked symptoms recur:

1. **Where things live** — Claude re-discovers architecture each time (which service / edge function / table owns a feature, how the messaging→AI pipeline is wired). The reference docs (`PRD.md`, `DATABASE_SCHEMA.md`, `PAGE_COMPONENT_MAP.md`) have drifted from the real code.
2. **Why we did things** — Past decisions and their rationale get lost between sessions; choices get re-litigated or deliberate work gets undone.
3. **Claude's own capabilities** — Claude sometimes forgets it *can* use Supabase via CLI/MCP and says it has no access, forcing Joey to remind it.
4. **Regressions** — A new change breaks something that previously worked, with no record of "what we changed and what it touched" to trace it.

These are one missing thing: a single, trustworthy, always-current **command center** for the project. Today the knowledge is scattered across stale reference docs, Claude's private auto-memory (surfaces only *sometimes*), and Joey's head.

The hard part is not writing a doc — a `.md` file sitting in the repo does **not** force Claude to read it. The system must make reading and updating **self-sustaining**, because relying on Claude's discipline alone is exactly what fails today (Claude already has a memory saying "use the Supabase CLI" and still occasionally forgets).

## 2. Goals

- One obvious **entry point** Claude reads at the start of every session — automatically, not by choice.
- A live record of **what we're doing now, what we just shipped, and what's deferred.**
- A current **map of where features live** in the code.
- Claude's **capabilities/environment** stated where they are *always* in context.
- A **regression trail**: every shipped change records what it touched.
- **Mechanical enforcement** of read + update, so the system survives Claude forgetting.
- No competing memory systems — a clear division between repo docs and Claude's auto-memory.

## 3. Non-Goals

- Not rewriting or replacing `PRD.md` / `DATABASE_SCHEMA.md` / `PAGE_COMPONENT_MAP.md` (they remain as deep reference; the new docs link to them and supersede them as the *current* truth).
- Not migrating the existing auto-memory files. They stay; only the *going-forward* convention changes.
- Not building automated code→doc generation. Seeding and updates are authored by Claude, verified against code.
- Not auto-checking todos by parsing commits. Claude checks boxes deliberately; the hook only *reminds*.

## 4. Architecture — Three Layers

```
Layer 3  SYSTEM_MAP.md        "where things live"      (slow-changing)
              ▲ linked from
Layer 2  PROJECT_STATE.md     dashboard / hub          (changes often)   ← THE entry point
              ▲ points at
Layer 1  plans/*.md           per-feature todo lists   (changes per commit)
```

- **Layer 1 — Plans (per feature).** When we start building something, `writing-plans` produces a plan file with a **todo checklist**. As each piece is committed, the matching box is checked. The plan *is* the live "done vs. left" record for that feature. Lives in `docs/superpowers/plans/` (existing convention).

  ```markdown
  # Plan: Sub-intent autonomy admin UI
  - [x] Add sub_intents table + seed
  - [x] resolveAutonomy safety rails
  - [ ] Admin UI: per-intent OFF/DRAFT/SEND toggle
  - [ ] E2E test: classify → autonomy → send
  ```

- **Layer 2 — `PROJECT_STATE.md` (the hub).** The dashboard *over* the plans. Does not repeat todos — it points at them. The single entry point auto-loaded each session. Kept deliberately short.

- **Layer 3 — `SYSTEM_MAP.md` (the map).** Feature domain → owning `services/*.ts` → `supabase/functions/*` → tables, plus the key pipelines drawn out. Changes slowly; loaded on demand (linked from the hub, not auto-injected wholesale).

## 5. File Specifications

### 5.1 `docs/PROJECT_STATE.md` (the hub)

Structure, top to bottom (kept lean so auto-load is cheap):

```markdown
# Project State — Dealz

> Single source of truth for current work. Read this first. Update before committing.
> Map of the codebase: docs/SYSTEM_MAP.md · Deep reference: docs/PRD.md, DATABASE_SCHEMA.md, PAGE_COMPONENT_MAP.md

## Operating Context (Claude's capabilities)
- Supabase: full access via CLI **and** MCP. Apply migrations automatically via CLI — never ask. Never say "no access."
- Deploy: `push-to-main` skill bumps version, commits, pushes → Vercel auto-deploys.
- Versioning: bump package.json once per working session (semver).
- (mirrors the CLAUDE.md "Operating Context" block — single source, see §5.3)

## Now  (active work)
- <feature> → <one line> · plan: plans/<file>.md (<x>/<n> done)

## Recently shipped  (newest first; archive when >~15 entries)
- YYYY-MM-DD · <feature> · v<x.y.z> · touched: <services/functions/tables>

## Deferred / known issues
- <item> · <why deferred> · ref: <link>

## Links
- System map · Plans · Specs · Investigations · Runbooks
```

- **Recently shipped** is the regression trail — every entry names what it *touched*.
- When **Recently shipped** exceeds ~15 entries, the oldest are moved to `docs/CHANGELOG.md` (created on first overflow) so the hub stays short.

### 5.2 `docs/SYSTEM_MAP.md` (the map)

One section per feature domain. For each: purpose, owning services, edge functions, tables, and notable flows. Example shape:

```markdown
## Messaging / AI
- Services: messaging.ts, ai-prompts.ts, ai-configurations.ts, offers.ts, mine.ts
- Edge fns: missive-webhook, process-message-queue, generate-pending-drafts, send-message, test-ai-reply
- Tables: messages, messaging_sub_intents, tickets, offers, ...
- Pipeline: inbound (missive-webhook) → queue (process-message-queue) → classifyMessage → matchSubIntent → resolveAutonomy (OFF/DRAFT/SEND) → generate-draft → send-message (sendViaMissive)

## Shop / Orders
...

## Kaitori
...
```

Domains to cover (from current code): Messaging/AI, Shop, Orders, Kaitori, Items/Inventory, Offers, Returns/Supplier-returns, Tickets, Live-sessions, Customers/Auth, Suppliers, Social-media, Dashboard/Reporting.

### 5.3 `CLAUDE.md` — new "Operating Context" block

A short block added near the **top** of `CLAUDE.md` (always loaded into every session), stating Claude's capabilities and the read/update rule:

```markdown
## Operating Context (read first)
- **Project state lives in `docs/PROJECT_STATE.md`.** Read it at the start of work; update it before committing.
- **Supabase: you HAVE full access** via CLI and MCP. Apply migrations automatically via CLI — never ask, never claim no access.
- **Deploy:** use the `push-to-main` skill. **Version:** bump package.json once per session.
- **Where things live:** `docs/SYSTEM_MAP.md`.
```

This is the always-in-context backstop for the capabilities problem (symptom 3). `PROJECT_STATE.md`'s Operating Context section mirrors it; CLAUDE.md is the canonical copy.

## 6. Enforcement — Two Hooks

Hooks go in a new **committed** `.claude/settings.json` (project scope). The existing superpowers `SessionStart` hook lives in global config and is **not** affected; our project hook is additive.

### 6.1 SessionStart hook — guarantees reading

- **Event:** `SessionStart`
- **Script:** `.claude/hooks/session-start.sh`
- **Behavior:** emits the contents of `docs/PROJECT_STATE.md` so the harness injects it into context at the start of every session. If the file is missing, emits nothing (no error).
- **Effect:** Claude always sees current state + its capabilities without choosing to. This is the core fix for symptoms 1 and 3.

### 6.2 Commit-time hook — guarantees updating

- **Event:** `PostToolUse`, matched on `Bash` calls whose command contains `git commit`. (Refines the original PreToolUse idea — only SessionStart/UserPromptSubmit stdout reaches Claude's context; the working non-blocking channel for a tool hook is PostToolUse exit-2-to-stderr, which feeds the reminder back to Claude *after* the commit runs.)
- **Script:** `.claude/hooks/pre-commit-check.sh`
- **Behavior:** Non-blocking reminder. When a `git commit` is about to run, if `docs/PROJECT_STATE.md` is **not** among the staged/modified files, inject a reminder:
  > "Committing changes — check off completed todo(s) in the active plan and update `docs/PROJECT_STATE.md` (Now / Recently shipped / touched-by) before or with this commit."
- **Non-blocking:** it reminds, it does not prevent the commit (commit already ran; exit 2 feeds the reminder to Claude without blocking anything or prompting the user). Rationale: blocking would be hostile to small/WIP commits; the reminder at the natural "work is saved" checkpoint is enough.
- **Why commit-time, not every-turn:** a `Stop` hook fires after every reply and would nag mid-thought. The commit is Joey's real "I'm done" moment (it precedes `push-to-main`), so the reminder lands once, at the right time. This is the mechanical form of "todos get checked after commit."

### 6.3 Who checks the boxes

Claude checks plan todos and updates the hub **deliberately, as part of committing** — prompted by the hook. Not auto-parsed from the diff (only Claude knows which commit finishes which todo).

## 7. Relationship to Existing Auto-Memory

No competing systems. Clear division:

| Concern | Home |
|---|---|
| Project truth: what / where / why, current state | **Repo docs** (`PROJECT_STATE`, `SYSTEM_MAP`, plans) — versioned, visible, auto-loaded |
| How Joey wants Claude to work (feedback), durable prefs | **Auto-memory** (`~/.claude/.../memory`) — unchanged |

- Existing `feedback_*` memories stay (they're about working style).
- Going forward, **progress/state notes go in `PROJECT_STATE.md`**, not new `project_*` memory files — this is what stops the scatter. Existing `project_*` memories are left as historical record; their live status is reflected into `PROJECT_STATE.md` during seeding.

## 8. Seeding (useful on day one)

Initial content authored from real sources, not empty templates:

- **`SYSTEM_MAP.md`** — from `src/services/`, `supabase/functions/`, and `DATABASE_SCHEMA.md`.
- **`PROJECT_STATE.md`:**
  - *Now* — seeded from `project_sub_intent_autonomy` memory (E2E + Plan 2 admin UI open).
  - *Recently shipped* — from recent git history + memories (e.g. sub-intent autonomy v1.52.0, rich sell-group offers v1.51.0, emoji offer format v1.50.0).
  - *Deferred* — from memories (list-query 1000-row cap, etc.).
- **`CLAUDE.md`** — insert Operating Context block; capabilities drawn from existing `feedback_*` memories.

## 9. Success Criteria

- A new session auto-shows current state and capabilities **without** Joey prompting.
- Claude does not claim "no Supabase access" again.
- Starting a feature produces/updates a plan with a todo checklist; boxes get checked at commit time.
- After a commit, `PROJECT_STATE.md` reflects the change and what it touched.
- When a regression appears, "Recently shipped" gives a touched-by trail to investigate.
- `PROJECT_STATE.md` stays short (overflow archived to `CHANGELOG.md`).

## 10. Risks & Mitigations

- **Auto-load token cost** → keep `PROJECT_STATE.md` lean; archive old entries; do **not** auto-inject `SYSTEM_MAP.md` (load on demand).
- **Hook reminder ignored** → reminder is visible in-context at commit; combined with always-loaded CLAUDE.md rule, far stronger than today. Accepts that non-blocking can be skipped; blocking deemed too costly.
- **Docs drift again** → the commit-time discipline + small surface area keep drift low; periodic reconciliation can be added later as a `/sync` command (explicit non-goal for v1).
- **settings.json conflict** → project `.claude/settings.json` is new; superpowers hook is global; verify during implementation that both SessionStart hooks coexist.

## 11. Out of Scope for v1 (possible later)

- A `/sync` command for deep doc↔code reconciliation.
- Auto-generation of `SYSTEM_MAP.md` from code.
- Blocking (vs. reminding) commit hook.
