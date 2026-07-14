# Setting up the Dealz Operator on another Mac

This folder is a self-contained "operator workspace". Point Claude Code at it and you get
a safe AI operator for Dealz: it can survey what needs attention, investigate customer
conversations, check stock, and PROPOSE replies — but it cannot touch code, run shell
commands, or send anything to a customer without approval in the webapp's
**AI Operations** page.

> **Only need to approve/reject proposals?** You don't need any of this — just open the
> webapp's AI Operations page in a browser with your staff login. This setup is only for
> DRIVING the agent (asking it to scan, investigate, and draft).

## One-time setup (~10 minutes)

### 1. Install the prerequisites (Terminal)

```bash
# Node.js 22 (runs the toolbelt server) — or use the installer from nodejs.org
curl -fsSL https://fnm.vercel.app/install | bash && exec $SHELL && fnm install 22

# Claude Code
curl -fsSL https://claude.ai/install.sh | bash
```

### 2. Copy the workspace from the main Mac

On the MAIN Mac (where the repo lives), build a clean bundle — the ops folder plus the
two Supabase keys, and nothing else (the codebase stays behind):

```bash
cd /Users/joeymisa/Documents/Projects/inventory-claude
mkdir -p /tmp/dealz-ops-bundle/ops
rsync -a --exclude node_modules ops/ /tmp/dealz-ops-bundle/ops/
grep -E "^(VITE_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local > /tmp/dealz-ops-bundle/.env.local
```

AirDrop `/tmp/dealz-ops-bundle` to the other Mac and put it at `~/dealz-ops-bundle`.

**The structure matters** — `.env.local` must sit NEXT TO the `ops` folder (the server
looks for it one level up):

```
~/dealz-ops-bundle/
├── .env.local     ← the two keys
└── ops/           ← this folder
```

### 3. Install the toolbelt (on the new Mac, once)

```bash
cd ~/dealz-ops-bundle/ops/server && npm install
```

### 4. Start operating

```bash
cd ~/dealz-ops-bundle/ops && claude
```

- First launch: log in with the Claude subscription account, then accept the two
  prompts — *trust this folder* and *enable the `dealz-ops` MCP server*.
- Then just talk to it:
  - **"What needs attention?"** — sweeps unanswered customers, open tickets, stuck
    orders, kaitori follow-ups, intake backlog, and more
  - **"Morning scan"** — same sweep, plus files a briefing card in AI Operations
  - **"Work the queue"** — investigates waiting conversations and proposes replies
    for approval

## Why this is safe

- Claude Code in this folder has **no shell, no file editing, no web access**
  (`.claude/settings.json` travels with the folder).
- Its only tools are the whitelisted `dealz-ops` ones; the only "write" creates proposal
  cards that a human approves in the webapp.
- The codebase is not on this machine at all.
- The **kill-switch** in the AI Operations page halts every tool instantly, from any
  device.

⚠️ `.env.local` contains a powerful database key — treat this Mac as trusted: FileVault
on, don't forward the bundle to anyone.

## Updating

When the harness gains new tools, re-run step 2 on the main Mac and AirDrop again — it's
a straight overwrite. Re-run step 3 only if `ops/server/package.json` changed.

## Future

A later slice can host the `dealz-ops` server remotely (with proper auth), so driving
the agent works from claude.ai, a phone, or any machine with ZERO install. Until then,
this local setup is the safest way to build trust.
