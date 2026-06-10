# Plan — Local-Supabase Restore Test Workflow

**Status:** deferred. Pick this up once Docker (or OrbStack) is installed and we're ready to validate the backup pipeline end-to-end.
**Owner:** TBD (whoever picks up the next backup work session).
**Prereq:** the manual-weekly backup pipeline at `scripts/backup/` is already built (see `docs/runbooks/backup-restore.md`).

---

## Why

The current restore drill (per the runbook) tells you to spin up a throwaway free Supabase project and run `restore.sh` against it. That works but:

- Burns one of your 2 free-tier project slots.
- Slow (project creation, network round-trips for migrations + storage).
- Painful to repeat — but repetition is exactly what makes a restore drill worth doing.

Supabase's local stack (`supabase start`, runs Postgres + GoTrue + Storage + edge runtime in Docker) gives us a free, fast, repeatable restore target. After this is built, you can run a full DR drill in ~2 minutes after every weekly backup as a sanity check.

---

## Scope

A new script `scripts/backup/restore/test-restore-local.sh` plus a small `--skip-functions` flag on the existing `restore.sh`. No changes to the backup-side scripts (`baseline.sh`, `weekly.sh`).

This is a **test harness only**. The real DR target is still a fresh cloud Supabase project — this just gives us a way to confirm the backup is restorable without touching cloud.

---

## One-time setup steps

1. **Install Docker.** OrbStack (lighter, faster startup, free for personal use) is preferred:
   ```bash
   brew install --cask orbstack
   open -a OrbStack
   ```
   Or Docker Desktop:
   ```bash
   brew install --cask docker
   open -a Docker
   ```
   Confirm: `docker info` exits 0.

2. **`supabase init` in the project root.** We currently have no `supabase/config.toml`; `supabase start` will refuse to run without it.
   ```bash
   cd /Users/joeymisa/Documents/Projects/inventory-claude
   supabase init
   ```
   This creates `supabase/config.toml` with default ports (54321 API, 54322 Postgres, 54323 Studio, 54324 Inbucket). **Commit this file** — every dev needs the same local layout.

3. **Verify the local stack starts cleanly.**
   ```bash
   supabase start          # ~30s first time (image pulls), ~5s after
   supabase status         # confirm all services UP
   supabase status -o env  # prints the local creds we'll consume from the script
   supabase stop           # for now
   ```
   Expected env keys from `status -o env`: `DB_URL`, `API_URL`, `STUDIO_URL`, `S3_PROTOCOL_ACCESS_KEY_ID`, `S3_PROTOCOL_SECRET_ACCESS_KEY`, `S3_PROTOCOL_REGION`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`. (Names may vary slightly across CLI versions; the script must parse from this output, not hardcode.)

---

## Implementation steps

### Step 1 — Add `--skip-functions` flag to `restore.sh`

File: `/Users/joeymisa/Documents/Projects/inventory-claude/scripts/backup/restore/restore.sh`

- Parse a single optional flag `--skip-functions` (or `--target-local`) before the positional `<backup-folder>` argument.
- When set, `restore_functions` is skipped and a log line is printed: `Functions: skipped (--skip-functions). Source tree is already in supabase/functions/.`
- When restoring to local, function deployment is meaningless (`supabase functions deploy` always pushes to a cloud project); on local you'd run `supabase functions serve` instead, which is out of scope for a restore drill.
- Keep the manual follow-up checklist printed at the end, but conditionally suppress the "re-create function secrets" line when `--skip-functions` is on.

### Step 2 — Create `scripts/backup/restore/test-restore-local.sh`

Behavior, in order:

1. **Prereq check** — Docker daemon up, `supabase` CLI present, `psql` present, `jq` present, `supabase/config.toml` exists. Each missing prereq prints an actionable hint.

2. **Argument parsing** — single positional arg `<backup-folder>`. Validate it exists and contains `manifest.json`.

3. **Read `BACKUP_PASSPHRASE` from `.env.backup`** — needed to decrypt the encrypted artifacts. Fail clearly if missing.

4. **Start local stack:**
   ```bash
   supabase start --workdir "$REPO_ROOT" || die "supabase start failed"
   ```

5. **Capture local creds via `supabase status -o env`** and write a `.env.restore` containing:
   ```
   TARGET_DB_URL=<DB_URL from status>
   TARGET_PROJECT_REF=local
   TARGET_S3_ACCESS_KEY_ID=<S3_PROTOCOL_ACCESS_KEY_ID>
   TARGET_S3_SECRET_ACCESS_KEY=<S3_PROTOCOL_SECRET_ACCESS_KEY>
   TARGET_S3_ENDPOINT=<API_URL>/storage/v1/s3
   TARGET_S3_REGION=<S3_PROTOCOL_REGION or default 'local'>
   ```
   **Important:** back up any existing `.env.restore` to `.env.restore.cloud-backup` before overwriting; restore it on script exit. Tests should never silently clobber a real cloud restore config.

6. **Apply migrations to clean local Postgres:**
   ```bash
   supabase db reset --workdir "$REPO_ROOT"
   ```
   This drops and recreates the local DB, then applies every migration. Idempotent; safe to re-run.

7. **Run the actual restore:**
   ```bash
   ./scripts/backup/restore/restore.sh --skip-functions "$BACKUP_FOLDER" \
     <<< "local"   # auto-confirm the project-ref prompt with "local"
   ```
   The auto-confirmation matters because `restore.sh` requires the user to type the target project ref — when targeting local, that's literally the string `local`.

8. **Smoke-test the result.** Run a SQL count comparison and a storage list:
   ```sql
   select 'auth.users' as table_name, count(*) from auth.users
   union all select 'customers', count(*) from customers
   union all select 'items', count(*) from items
   union all select 'orders', count(*) from orders
   union all select 'kaitori_requests', count(*) from kaitori_requests
   union all select 'sell_groups', count(*) from sell_groups
   union all select 'product_models', count(*) from product_models;
   ```
   ```bash
   rclone --config <local-cfg> ls target:photo-group-media | head -5
   rclone --config <local-cfg> ls target:id-documents     | head -5
   ```
   Print all results. Don't compare against a baseline — just show the numbers; the human eyeballs them.

9. **Print the Studio URL** (e.g., `http://127.0.0.1:54323`) and an ASCII summary box. Prompt: `Leave the local stack running for manual inspection? [Y/n]`. If `n`, run `supabase stop`.

10. **Restore the original `.env.restore`** (from the backup made in step 5) on exit, so the user's cloud restore config is unchanged.

### Step 3 — Update the runbook

File: `/Users/joeymisa/Documents/Projects/inventory-claude/docs/runbooks/backup-restore.md`

Replace the current "Test-restore drill" section with two paths:

- **Recommended: local Supabase drill** — uses the new script. Repeatable after every weekly backup. RTO captured here is "restore-only-time"; not the full DR RTO (which includes new project creation).
- **Cloud project drill (do this once)** — keeps the current content as the "real" DR drill. Run it once after the baseline to verify the cloud-target path actually works.

Add a "Run the local drill weekly" recommendation: after running `weekly.sh`, optionally run `test-restore-local.sh` against the just-produced backup before deleting the local copy.

### Step 4 — Verify the whole chain

After implementation:

1. Take a fresh backup against the live cloud project: `./scripts/backup/baseline.sh`.
2. Run the new local drill: `./scripts/backup/restore/test-restore-local.sh backups/baseline-YYYY-MM-DD`.
3. Confirm:
   - All 110 migrations apply cleanly to the local Postgres.
   - `pg_restore --data-only` exits 0 with no FK violations.
   - Counts for `auth.users`, `customers`, `items`, `orders`, `kaitori_requests` are non-zero and match expectation.
   - Sample objects in each storage bucket are uploaded and `rclone ls` shows them.
   - One ID document, when downloaded via `rclone copy target:id-documents/<file>` to a temp dir, is openable as a valid JPEG/PDF.
4. `supabase stop --no-backup` (the `--no-backup` flag wipes the local Docker volumes) — clean slate for next time.

---

## Open questions to confirm before / during execution

1. **OrbStack vs Docker Desktop?** Default to OrbStack unless the user already has Docker Desktop running. (User leaned this way during planning but hadn't installed yet.)
2. **Auto-confirmation in `restore.sh`** — should the `--skip-functions` flag also relax the typed-confirmation prompt (since "local" is a fixed string anyway)? Cleaner: keep the prompt, hardcode `local` as the project ref, and the test script pipes the answer in. Already covered in step 7 above; flagged here in case we want a `--yes` flag too.
3. **Should `supabase db reset` happen automatically or with a confirmation?** It's destructive against the local stack. Since the local stack is by definition disposable, automatic is fine — but worth printing a clear "RESETTING local DB now" line.
4. **Do we want the test to assert** counts > 0 and fail noisily, or just print and let the human eyeball? Print-only is simpler and matches the "test drill, not CI" framing. Revisit if we ever wire this into CI.
5. **Storage bucket auto-creation on local** — `supabase db reset` should create them via the migration that defines them (`20260210000002_rls_and_storage.sql`). Confirm during step 4 of verification; if not, the script may need an explicit `supabase storage create-bucket` call before restore.

---

## Estimated effort

- Step 1 (`--skip-functions` flag): ~15 min
- Step 2 (`test-restore-local.sh`): ~60 min including iteration on env-var parsing
- Step 3 (runbook updates): ~20 min
- Step 4 (verification + iteration): ~30 min, dominated by the first `supabase start` Docker pull

**Total: ~2 hours of focused work**, assuming Docker is already installed and a baseline backup already exists.

---

## What this plan does NOT cover

- Automating the local drill in CI (GitHub Actions). Possible later, but it'd require running Docker-in-Docker or self-hosted runners — not worth it for a manual-discipline backup workflow.
- Restoring edge function secrets. Not a problem for the local drill (no real third-party calls happen against local) but still a manual step on real cloud restores.
- Differential / incremental restore testing. Out of scope; restore is full-fat each time.

---

## File checklist when implementing

- [ ] `scripts/backup/restore/restore.sh` — add `--skip-functions` flag handling.
- [ ] `scripts/backup/restore/test-restore-local.sh` — new script (chmod +x).
- [ ] `supabase/config.toml` — created via `supabase init`, committed.
- [ ] `docs/runbooks/backup-restore.md` — replace "Test-restore drill" section as described.
- [ ] `.gitignore` — confirm `.env.restore.cloud-backup` is covered (it is, since `.env.restore*` matches via the existing `.env.restore` rule? — actually no, the current rule is exact match. Add `.env.restore*` to be safe).
