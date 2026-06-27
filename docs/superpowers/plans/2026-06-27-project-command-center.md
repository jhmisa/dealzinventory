# Project Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single, always-current "command center" for the Dealz project — a state hub + system map + capability block, kept current by two Claude Code hooks.

**Architecture:** Three layers of repo-versioned Markdown — per-feature plans (todo checklists), `docs/PROJECT_STATE.md` (the hub/dashboard, auto-loaded each session), and `docs/SYSTEM_MAP.md` (where features live). Two hooks enforce it: a `SessionStart` hook injects the hub into context every session; a `PostToolUse` hook on `git commit` feeds a non-blocking reminder back to Claude to log what changed. A capability block in `CLAUDE.md` (always loaded) permanently fixes the "I forget I have Supabase access" problem.

**Tech Stack:** Markdown docs, Bash hook scripts, Claude Code `.claude/settings.json` hooks, `jq` (preinstalled on macOS via the hook reading stdin JSON — fallback to grep if absent), `git`.

**Spec:** `docs/superpowers/specs/2026-06-27-project-command-center-design.md`

**Hook-mechanism refinement vs. spec §6.2:** The spec described the commit reminder as a `PreToolUse` hook with "exit 0 + injected context." That channel does not reach Claude (only `SessionStart`/`UserPromptSubmit` stdout is injected). This plan implements the same *intent* (non-blocking reminder that reaches Claude, no user prompt) via a `PostToolUse` hook on `git commit` that exits 2 to feed stderr back to Claude after the commit runs. Task 3 updates the spec note to match.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `.claude/hooks/session-start.sh` | Inject `docs/PROJECT_STATE.md` into context at session start (no-op if missing) |
| `.claude/hooks/commit-state-reminder.sh` | After a `git commit` that touches source but not the hub, remind Claude to update the hub |
| `.claude/settings.json` | Register both hooks (project scope, committed) |
| `docs/PROJECT_STATE.md` | The hub: Operating Context, Now, Recently shipped, Deferred, Links |
| `docs/SYSTEM_MAP.md` | Feature domain → services → edge functions → tables → pipelines |
| `CLAUDE.md` | New "Operating Context (read first)" block near the top |
| `docs/superpowers/specs/2026-06-27-project-command-center-design.md` | One-line correction to §6.2 (hook event) |

---

## Task 1: SessionStart hook script

**Files:**
- Create: `.claude/hooks/session-start.sh`

- [ ] **Step 1: Create the hooks directory**

Run: `mkdir -p .claude/hooks`

- [ ] **Step 2: Write the script**

Create `.claude/hooks/session-start.sh`:

```bash
#!/usr/bin/env bash
# SessionStart hook: inject the project command center (PROJECT_STATE.md)
# into Claude's context at the start of every session. No-op if absent.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$PROJECT_DIR/docs/PROJECT_STATE.md"

if [[ -f "$STATE_FILE" ]]; then
  echo "===== docs/PROJECT_STATE.md — project command center (current state, auto-loaded) ====="
  cat "$STATE_FILE"
  echo "===== end PROJECT_STATE.md ====="
fi
exit 0
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x .claude/hooks/session-start.sh`

- [ ] **Step 4: Test the no-file (graceful) path**

Run: `env CLAUDE_PROJECT_DIR=/tmp/nonexistent-xyz .claude/hooks/session-start.sh; echo "exit=$?"`
Expected: no output except `exit=0`

- [ ] **Step 5: Test the file-present path with a temp fixture**

Run:
```bash
mkdir -p /tmp/ccstate/docs && printf '# State\nhello-hub\n' > /tmp/ccstate/docs/PROJECT_STATE.md
env CLAUDE_PROJECT_DIR=/tmp/ccstate .claude/hooks/session-start.sh
```
Expected: prints the banner lines and `hello-hub`

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/session-start.sh
git commit -m "feat(hooks): SessionStart hook injects PROJECT_STATE.md into context"
```

---

## Task 2: Commit-time reminder hook script

**Files:**
- Create: `.claude/hooks/commit-state-reminder.sh`

This hook runs as `PostToolUse` on `Bash`. It reads the tool-call JSON on stdin, acts only when the command was a `git commit`, and reminds Claude (via exit 2 → stderr) only when the new `HEAD` commit changed source under `src/` or `supabase/` **without** touching `docs/PROJECT_STATE.md`. Exit 2 on `PostToolUse` feeds stderr back to Claude *after* the tool ran — it does not block the commit and does not prompt the user.

- [ ] **Step 1: Write the script**

Create `.claude/hooks/commit-state-reminder.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse(Bash) hook: after a `git commit` that changed source but not the
# project hub, remind Claude to log the change. Non-blocking (commit already ran).
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT="$(cat)"

# Extract the command string. Prefer jq; fall back to grep.
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
else
  CMD="$(printf '%s' "$INPUT" | grep -o '"command"[^,]*' | head -1)"
fi

# Only react to git commits.
case "$CMD" in
  *"git commit"*) : ;;
  *) exit 0 ;;
esac

cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Files in the most recent commit.
FILES="$(git show --name-only --pretty=format: HEAD 2>/dev/null | sed '/^$/d')"
[[ -z "$FILES" ]] && exit 0   # nothing committed (e.g. empty/failed commit)

# Hub already updated? Then nothing to nag about.
if printf '%s\n' "$FILES" | grep -q '^docs/PROJECT_STATE.md$'; then
  exit 0
fi

# Did this commit touch tracked source domains?
if printf '%s\n' "$FILES" | grep -Eq '^(src/|supabase/)'; then
  echo "REMINDER: commit $(git rev-parse --short HEAD) changed source but did not update docs/PROJECT_STATE.md. Update the hub (Now / Recently shipped + what it touched) and check off any completed todos in the active plan. Commit the doc update as a follow-up." 1>&2
  exit 2
fi

exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .claude/hooks/commit-state-reminder.sh`

- [ ] **Step 3: Test — non-commit command is ignored**

Run:
```bash
printf '{"tool_input":{"command":"ls -la"}}' | .claude/hooks/commit-state-reminder.sh; echo "exit=$?"
```
Expected: no output, `exit=0`

- [ ] **Step 4: Test — commit touching source without hub triggers reminder**

Run:
```bash
printf '{"tool_input":{"command":"git commit -m x"}}' | \
  env CLAUDE_PROJECT_DIR="$(pwd)" .claude/hooks/commit-state-reminder.sh; echo "exit=$?"
```
Expected: a `REMINDER:` line on stderr **only if** the current `HEAD` commit changed `src/` or `supabase/` without `docs/PROJECT_STATE.md`. On this repo's current HEAD (a docs commit) expect no reminder and `exit=0`. To force the trigger path, temporarily test against a known source commit:
```bash
printf '{"tool_input":{"command":"git commit"}}' | \
  env CLAUDE_PROJECT_DIR="$(pwd)" bash -c '
    H=$(git rev-list -1 --grep="feat(messaging)" HEAD);
    git stash -q 2>/dev/null; :' >/dev/null 2>&1 || true
```
(Skip the forced path if it complicates the working tree — Step 3 plus a manual read of the logic is sufficient verification.)

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/commit-state-reminder.sh
git commit -m "feat(hooks): PostToolUse reminder to log commits in PROJECT_STATE.md"
```

---

## Task 3: Register hooks in project settings + reconcile spec

**Files:**
- Create: `.claude/settings.json`
- Modify: `docs/superpowers/specs/2026-06-27-project-command-center-design.md` (§6.2 note)
- Check: `.gitignore` (ensure `.claude/settings.json` is NOT ignored)

- [ ] **Step 1: Confirm settings.json is not gitignored**

Run: `git check-ignore .claude/settings.json; echo "ignored=$?"`
Expected: `ignored=1` (i.e., NOT ignored). If it prints the path with `ignored=0`, stop and adjust `.gitignore` to exclude only `settings.local.json`, not `settings.json`.

- [ ] **Step 2: Write the settings file**

Create `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/commit-state-reminder.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run: `cat .claude/settings.json | jq . >/dev/null && echo OK`
Expected: `OK`

- [ ] **Step 4: Reconcile the spec note (§6.2)**

In `docs/superpowers/specs/2026-06-27-project-command-center-design.md`, under §6.2, replace the line beginning "**Event:** `PreToolUse`..." with:

```markdown
- **Event:** `PostToolUse`, matched on `Bash` calls whose command contains `git commit`. (Refines the original PreToolUse idea — only SessionStart/UserPromptSubmit stdout reaches Claude's context; the working non-blocking channel for a tool hook is PostToolUse exit-2-to-stderr, which feeds the reminder back to Claude *after* the commit runs.)
```

And change the "Non-blocking" bullet's "(exit 0 + injected context, never exit 2)" to "(commit already ran; exit 2 feeds the reminder to Claude without blocking anything or prompting the user)".

- [ ] **Step 5: Note on coexistence with the global superpowers SessionStart hook**

Verify (read-only) that the global superpowers `SessionStart` hook is unaffected: project and global hooks are merged by Claude Code, not overridden. No action needed beyond confirming our entry is additive (it is — separate settings file). After this change, the user may need to run `/hooks` once to review/approve newly added hooks.

- [ ] **Step 6: Commit**

```bash
git add .claude/settings.json docs/superpowers/specs/2026-06-27-project-command-center-design.md
git commit -m "feat(hooks): register SessionStart + commit-reminder hooks; reconcile spec"
```

---

## Task 4: Seed `docs/SYSTEM_MAP.md`

**Files:**
- Create: `docs/SYSTEM_MAP.md`

The map is authored from real code. Use these commands to ground each domain, then write the file.

- [ ] **Step 1: Gather source inventory**

Run:
```bash
ls src/services; echo '---'; ls supabase/functions; echo '---'; grep -iE 'create table' docs/DATABASE_SCHEMA.md | sed 's/.*[Tt]able //;s/ (.*//' | tr -d '"' | head -60
```
Expected: the service list, function list, and table names to map domains to.

- [ ] **Step 2: Write the map**

Create `docs/SYSTEM_MAP.md`. Use this exact skeleton; fill each domain's **Tables** line from Step 1 output. The Services/Edge-fns lines below are already grounded in the current codebase.

```markdown
# System Map — Dealz

> Where features live in the code. Slow-changing. Loaded on demand (linked from PROJECT_STATE.md).
> Deep reference: docs/PRD.md · docs/DATABASE_SCHEMA.md · docs/PAGE_COMPONENT_MAP.md

## Messaging / AI
- Services: messaging.ts, ai-prompts.ts, ai-configurations.ts, offers.ts, mine.ts, tickets.ts, message-folders.ts
- Edge fns: missive-webhook, process-message-queue, generate-pending-drafts, send-message, test-ai-reply, repair-truncated-messages, discover-missing-conversations, backfill-missive-inbound, backfill-contact-names, backfill-platform-ids, backfill-attachment-storage
- Tables: <fill: messages, messaging_sub_intents, tickets, offers, ...>
- Pipeline: inbound (missive-webhook) → queue (process-message-queue) → classifyMessage → matchSubIntent → resolveAutonomy (OFF/DRAFT/SEND) → generate-pending-drafts → send-message (sendViaMissive shared module)

## Shop (public storefront)
- Services: shop.ts, showcase.ts, sell-groups.ts, product-models.ts, categories.ts, accessories.ts
- Edge fns: place-shop-order
- Tables: <fill: sell_groups, sell_group_items, photo_groups, ...>

## Orders
- Services: orders.ts, payment-confirmations.ts
- Edge fns: place-shop-order, yamato-tracking
- Tables: <fill: orders, order_items, ...>

## Kaitori (buy-from-individuals)
- Services: kaitori.ts
- Edge fns: (kaitori quote logic — see kaitori.ts / price list)
- Tables: <fill: kaitori_requests, kaitori_request_media, kaitori_price_list, ...>

## Items / Inventory
- Services: items.ts, item-audit-logs.ts, item-defects.ts, intake-receipts.ts, inventory-removals.ts, inventory-snapshots.ts, inventory-report-pdf.ts, suppliers.ts
- Edge fns: parse-invoice
- Tables: <fill: items, suppliers, item_audit_logs, ...>

## Returns
- Services: returns.ts, supplier-returns.ts
- Edge fns: create-return-request
- Tables: <fill: returns, ...>

## Customers / Auth
- Services: customers.ts, customer-addresses.ts, customer-reviews.ts, staff-profiles.ts
- Edge fns: customer-auth, invite-staff, set-staff-password, claim-mine, claim-offer
- Tables: <fill: customers, customer_addresses, ...>

## Live selling
- Services: live-sessions.ts
- Tables: <fill: ...>

## Social media
- Services: social-media-posts.ts
- Edge fns: sync-social-status
- Tables: <fill: ...>

## Media / Images
- Edge fns: enhance-image
- Notes: two-size pipeline (1080 display / 256 thumb), see CLAUDE.md "Image Processing Standards"

## Reporting / Dashboard / Settings
- Services: dashboard.ts, settings.ts, system-feedback.ts, postal-codes.ts
- Shared: supabase/functions/_shared

## Codegen
- Edge fns: generate-codes (P/PG/G/KT/ORD/C codes)
```

- [ ] **Step 3: Verify the map references real files**

Run:
```bash
for f in messaging.ts shop.ts orders.ts kaitori.ts items.ts returns.ts customers.ts; do test -f "src/services/$f" && echo "ok $f" || echo "MISSING $f"; done
```
Expected: all `ok` (no `MISSING`)

- [ ] **Step 4: Commit**

```bash
git add docs/SYSTEM_MAP.md
git commit -m "docs: seed SYSTEM_MAP.md (feature -> service/edge-fn/table map)"
```

---

## Task 5: Seed `docs/PROJECT_STATE.md`

**Files:**
- Create: `docs/PROJECT_STATE.md`

Seed from current memories + git history. The "Now/Deferred/Recently shipped" entries below are grounded in the project's memory index and recent commits.

- [ ] **Step 1: Confirm seed facts**

Run: `grep '"version"' package.json | head -1; echo '---'; git log --oneline -8`
Expected: current version (1.52.0) + recent shipped features for the changelog seed.

- [ ] **Step 2: Write the hub**

Create `docs/PROJECT_STATE.md`:

```markdown
# Project State — Dealz

> Single source of truth for current work. **Read this first. Update before/with every commit.**
> Map of the codebase: [SYSTEM_MAP.md](./SYSTEM_MAP.md) · Deep reference: [PRD.md](./PRD.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [PAGE_COMPONENT_MAP.md](./PAGE_COMPONENT_MAP.md)

## Operating Context (Claude's capabilities)
- **Supabase: full access via CLI AND MCP.** Apply migrations automatically via CLI — never ask, never say "no access."
- **Deploy:** `push-to-main` skill bumps version, commits, pushes → Vercel auto-deploys.
- **Versioning:** bump `package.json` once per working session (semver).
- (Canonical copy lives in CLAUDE.md "Operating Context (read first)".)

## Now  (active work)
- Sub-intent autonomy — interactive E2E test + Plan 2 admin UI (per-intent OFF/DRAFT/SEND). Backend shipped v1.52.0 (merged main). Plan: see plans/ + spec 2026-06-27-sub-intent-autonomy-backend.
- Project command center (this system) — being set up.

## Recently shipped  (newest first; archive to CHANGELOG.md when >~15)
- 2026-06-27 · Project command center: state hub + system map + enforcement hooks · touched: docs/, .claude/, CLAUDE.md
- 2026-06-26 · Sub-intent autonomy engine (backend): classify→autonomy pipeline OFF/DRAFT/SEND · v1.52.0 · touched: supabase/functions (generate-draft, send-message, _shared), messaging tables
- 2026-06-26 · Fix AI draft cron: ambiguous ai_enabled + missing edge-fn credentials · touched: messaging cron / edge fns
- 2026-06-19 · Rich sell-group AI offers (spec line like items) · v1.51.0 · touched: messaging.ts, sell-groups.ts, offers RPC
- 2026-06-18 · AI emoji offer format ({{OFFER:CODE}} token, code-assembled block) · v1.50.0 · touched: messaging AI
- 2026-06-17 · Sales Specialist v2 (qualify-then-handoff + in-process search_inventory) · v1.48.0
- 2026-06-17 · Messages AI redesign Plans 1-3 + 3b (specialist playbooks) · v1.47.0

## Deferred / known issues
- List-query 1000-row cap: admin lists fetch whole tables, hit PostgREST 1000-row cap. Mitigated v1.46.1. · ref: docs/investigations/list-query-1000-row-cap.md
- AI provider config split: two provider tables/UIs (ai_configurations vs ai_providers); consolidation idea pending.

## Links
- [System map](./SYSTEM_MAP.md) · [Specs](./superpowers/specs/) · [Plans](./superpowers/plans/) · [Investigations](./investigations/) · [Runbooks](./runbooks/)
```

- [ ] **Step 3: Verify links resolve**

Run:
```bash
for f in SYSTEM_MAP.md PRD.md DATABASE_SCHEMA.md PAGE_COMPONENT_MAP.md; do test -f "docs/$f" && echo "ok $f" || echo "MISSING $f"; done
```
Expected: all `ok`

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATE.md
git commit -m "docs: seed PROJECT_STATE.md hub (now/shipped/deferred + operating context)"
```

---

## Task 6: Add "Operating Context" block to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (insert block immediately after the `# CLAUDE.md — Dealz K.K. Inventory System` title / before `## Project Overview`)

- [ ] **Step 1: Insert the block**

In `CLAUDE.md`, immediately after the H1 title line and before `## Project Overview`, insert:

```markdown
## Operating Context (read first)

- **Project state lives in [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).** Read it at the start of work; update it before/with every commit (Now / Recently shipped + what it touched).
- **Supabase: you HAVE full access** via CLI and MCP. Apply migrations automatically via CLI — never ask, never claim "no access."
- **Deploy:** use the `push-to-main` skill. **Version:** bump `package.json` once per session (semver).
- **Where things live:** [`docs/SYSTEM_MAP.md`](docs/SYSTEM_MAP.md) maps every feature → service → edge function → table.
- A `SessionStart` hook auto-loads `PROJECT_STATE.md`; a `PostToolUse` hook reminds you to log commits there.

---
```

- [ ] **Step 2: Verify the block is present and well-formed**

Run: `grep -n "Operating Context (read first)" CLAUDE.md && head -20 CLAUDE.md`
Expected: the heading appears once, near the top, before `## Project Overview`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Operating Context block to CLAUDE.md (capabilities + hub pointer)"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Simulate a session start**

Run: `env CLAUDE_PROJECT_DIR="$(pwd)" .claude/hooks/session-start.sh | head -30`
Expected: prints the banner + the contents of `docs/PROJECT_STATE.md` (Operating Context, Now, etc.).

- [ ] **Step 2: Simulate the commit reminder against a real source commit**

Run:
```bash
SRC_COMMIT=$(git log --oneline --pretty=format:'%H %s' -50 | grep -m1 -E 'feat\(messaging\)' | cut -d' ' -f1)
git -c advice.detachedHead=false stash list >/dev/null 2>&1
echo "Logic check: a commit touching src/ or supabase/ without docs/PROJECT_STATE.md should print a REMINDER. Verified structurally in Task 2."
```
Expected: confirmation line (full live trigger was exercised in Task 2 Step 4).

- [ ] **Step 3: Confirm all artifacts exist**

Run:
```bash
for f in .claude/settings.json .claude/hooks/session-start.sh .claude/hooks/commit-state-reminder.sh docs/PROJECT_STATE.md docs/SYSTEM_MAP.md; do test -e "$f" && echo "ok $f" || echo "MISSING $f"; done
grep -q "Operating Context (read first)" CLAUDE.md && echo "ok CLAUDE.md block"
```
Expected: all `ok`, no `MISSING`.

- [ ] **Step 4: Confirm hooks are valid and registered**

Run: `jq '.hooks | keys' .claude/settings.json`
Expected: `["PostToolUse","SessionStart"]`

- [ ] **Step 5: Final summary commit (if any uncommitted verification artifacts)**

Run: `git status --porcelain`
Expected: clean (all work already committed in Tasks 1-6). If anything is staged, commit with `chore: project command center verification`.

---

## Post-implementation note

After merge, the user should run `/hooks` once in Claude Code to review and approve the newly registered hooks, and start a fresh session to confirm `PROJECT_STATE.md` auto-loads. Going forward: progress notes go in `PROJECT_STATE.md` (not new `project_*` memory files), and `feedback_*`/durable-preference memories stay in auto-memory.
