# Dealz Backup & Restore Runbook

Manual, weekly, local-first backup of the Dealz Supabase project. You run a script on your Mac; it produces a single dated folder; you drag the folder into Google Drive.

If anything bad happens to the Supabase project — accidental delete, corruption, account lockout, region outage — this runbook is how you recreate the entire system on a fresh project.

---

## Contents

1. [What gets backed up](#what-gets-backed-up)
2. [One-time setup](#one-time-setup)
3. [Taking a backup (weekly)](#taking-a-backup-weekly)
4. [Verifying a backup](#verifying-a-backup)
5. [Uploading to Google Drive](#uploading-to-google-drive)
6. [Restoring — Scenario A: brand new project](#restoring--scenario-a-brand-new-project)
7. [Restoring — Scenario B: existing project, partial corruption](#restoring--scenario-b-existing-project-partial-corruption)
8. [Test-restore drill (do this once after the baseline)](#test-restore-drill)
9. [Troubleshooting](#troubleshooting)
10. [Threat model & encryption](#threat-model--encryption)

---

## What gets backed up

| Artifact | File in backup folder | Encrypted? |
|---|---|---|
| Postgres database (public + auth + storage schemas, schema **and** data, custom-format) | `db/full.dump.enc` | Yes |
| Schema-only plaintext (for diffing vs `supabase/migrations/`) | `db/schema.sql` | No |
| `photo-group-media` bucket (public product photos) | `storage/photo-group-media.tar.zst` | No |
| `kaitori-media` bucket (public Kaitori photos) | `storage/kaitori-media.tar.zst` | No |
| `item-media` bucket (inspection photos) | `storage/item-media.tar.zst` | No |
| `id-documents` bucket (legal ID docs) | `storage/id-documents.tar.zst.enc` | **Yes** |
| `supabase/functions/` source tree | `functions/functions.tar.zst` | No |
| List of currently-deployed edge functions | `functions/deployed.txt` | No |
| Git bundle of the whole repo (baseline only) | `git/repo.bundle` | No |
| Manifest with sha256 of every file | `manifest.json` | No |

What is **not** backed up here, and why:

- **Edge function secrets / env vars** — Supabase doesn't expose them via API. After a restore you must re-set them by hand from the dashboard. Keep a list of secret names in `docs/runbooks/key-management.md` (TODO).
- **Vercel env vars** — managed in Vercel, not Supabase. After restore, point them at the new project ref.
- **Webhooks pointed at the project from third parties** (Missive, Yamato, etc.) — note these somewhere; you'll re-aim them post-restore.

---

## One-time setup

### 1. Install CLI tools

```bash
brew install postgresql@17 && brew link --force postgresql@17
brew install rclone
brew install age            # not strictly needed; we use openssl, but harmless
brew install zstd jq
# supabase CLI is already installed if you've been working on this project
```

Verify:
```bash
pg_dump --version            # should report 17.x
rclone --version
zstd --version
openssl version
jq --version
supabase --version
```

### 2. Gather credentials

Open the Supabase dashboard for project `aeiyinpxmazmfubotpdk`:

| Credential | Where to find it |
|---|---|
| **Direct DB URL** | Project Settings → Database → Connection string → URI tab → mode "Direct connection" (port 5432). Reveal the password and substitute it into the URI. |
| **S3 access key + secret** | Storage → Settings → S3 Connection → "New access key". Generate a new key pair dedicated to backups. Store both halves — Supabase only shows the secret once. |

### 3. Pick a backup passphrase

You need a single strong passphrase. It encrypts the DB dump and the ID-documents tar. **If you lose this passphrase, those parts of every backup are gone.**

- Use a password manager (1Password / Bitwarden) entry called "Dealz backup encryption". Generate ≥ 24 random characters.
- Print a paper copy and put it in a sealed envelope in a physical safe. (Recovery for "lost laptop + lost password manager".)

### 4. Create `.env.backup`

```bash
cd /Users/joeymisa/Documents/Projects/inventory-claude
cp .env.backup.example .env.backup
# Edit .env.backup and fill in real values for SUPABASE_DB_URL,
# SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY, BACKUP_PASSPHRASE.
```

`.env.backup` is gitignored. Don't commit it. Don't paste it into chats.

### 5. Create the Drive folder

In Google Drive web UI, create `Dealz-Backups/`. This is where every dated folder will live. (Optional: enable "trash auto-empty after 30 days" in Drive settings so old deletes don't sit around.)

### 6. Set a calendar reminder

Recurring event: **every Sunday 21:00 JST — "Run Dealz weekly backup"**, with a note linking to this runbook.

---

## Taking a backup (weekly)

```bash
cd /Users/joeymisa/Documents/Projects/inventory-claude
./scripts/backup/weekly.sh
```

The script checks prereqs, dumps the DB, mirrors all four storage buckets, snapshots the edge functions, encrypts the sensitive bits, and writes a manifest. It prints something like:

```
======================================================================
  Backup complete: backups/weekly-2026-05-10 (143 MB)
======================================================================

  Open in Finder:    open "backups/weekly-2026-05-10"
  Verify integrity:  scripts/backup/lib/verify-manifest.sh "backups/weekly-2026-05-10"
  Upload to Drive:   drag the folder into Dealz-Backups/ in https://drive.google.com
```

**The very first time, run `./scripts/backup/baseline.sh` instead.** It's the same as weekly plus a one-time `git bundle` of the repo. Run it once; thereafter use `weekly.sh`.

---

## Verifying a backup

After the script finishes, before deleting the local copy:

```bash
./scripts/backup/lib/verify-manifest.sh backups/weekly-2026-05-10
```

This re-hashes every artifact and compares to `manifest.json`. You should see `N ok, 0 bad` at the end. If anything is bad, **do not upload** — re-run the backup.

---

## Uploading to Google Drive

1. Open Drive web UI → `Dealz-Backups/` folder.
2. Drag the entire dated folder (e.g. `weekly-2026-05-10`) from Finder into Drive.
3. Wait for the upload to finish; sample one file (e.g. `manifest.json`) and open it to confirm.
4. Once Drive shows the folder uploaded, you can delete the local copy:
   ```bash
   rm -rf backups/weekly-2026-05-10
   ```

### Retention you should follow manually

- Keep the **baseline** folder forever.
- Keep the most recent **12 weekly** folders (~3 months).
- Promote the first weekly of each month into a `monthly/` subfolder; keep those forever.
- Anything older than 12 weeks that wasn't promoted: delete.

(Drive is cheap; if you'd rather just keep everything, that's also fine.)

---

## Restoring — Scenario A: brand new project

This is the most common DR case (project deleted, account compromised, region down, etc.).

### A1. Create a new Supabase project

1. Dashboard → New project. Same region (`ap-northeast-1` / Tokyo) is fastest for the existing user base.
2. Capture the new project ref and the new database password.

### A2. Apply schema via migrations

Schema comes from migrations, not the dump. This is intentional — it avoids dragging Supabase-version-specific cruft from the source project, and it produces clean RLS, triggers, and extensions.

```bash
cd /Users/joeymisa/Documents/Projects/inventory-claude
supabase link --project-ref <NEW_REF>
supabase db push
```

This applies all 110 migrations in order. Watch for errors; if the migrations themselves are broken you must fix them in the repo before continuing.

### A3. Generate target S3 keys

In the new project's dashboard: Storage → Settings → S3 Connection → "New access key". Save both halves.

### A4. Set up `.env.restore`

```bash
cp .env.restore.example .env.restore
# Edit .env.restore: TARGET_DB_URL, TARGET_PROJECT_REF, TARGET_S3_*, TARGET_S3_ENDPOINT.
# Make sure .env.backup is also still in place — we read BACKUP_PASSPHRASE from it.
```

### A5. Download the backup folder from Drive

In Drive web UI, right-click the folder you want to restore from → Download. It comes as a ZIP. Unzip into `backups/`.

```bash
mkdir -p backups
unzip ~/Downloads/baseline-2026-05-06.zip -d backups/
```

### A6. Run the restore

```bash
./scripts/backup/restore/restore.sh backups/baseline-2026-05-06
```

The script will:

1. Verify the backup's manifest (re-hashes every file).
2. Ask you to type the target project ref to confirm. Type it.
3. Decrypt the DB dump and `pg_restore --data-only --disable-triggers` it.
4. Decrypt the ID-documents tar, extract every storage tar, `rclone copy` each bucket up to the target.
5. Deploy each edge function found in the tar via `supabase functions deploy`.

When it finishes you'll see a manual-follow-up checklist (see next).

### A7. Manual follow-up steps

The script prints these but they're easy to forget:

1. **Re-create edge function secrets** in the new project's dashboard (Functions → Settings). The dump doesn't contain them. Common secrets to set:
   - `SUPABASE_SERVICE_ROLE_KEY` (auto-set, but verify)
   - Any third-party API keys (Yamato, Missive, etc.) — check the source project's function settings before you restore, or recover from your password manager.
2. **Update Vercel env vars** to point at the new project:
   - `VITE_SUPABASE_URL` → `https://<NEW_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → new project's anon key (Project Settings → API)
   Trigger a redeploy.
3. **Re-aim third-party webhooks** (Missive, Yamato, etc.) at the new project's edge function URLs.
4. **Smoke-test**: log in as a staff user, scan a P-code QR, view a photo, view an ID document. If those four work, the restore worked.

### A8. Verify counts

```sql
-- Run in the target project's SQL editor:
select 'auth.users' as t, count(*) from auth.users
union all select 'customers', count(*) from customers
union all select 'items', count(*) from items
union all select 'orders', count(*) from orders
union all select 'kaitori_requests', count(*) from kaitori_requests;
```

Compare to the same query run against the source backup (or against the live project before the disaster, if you have it). They should match.

---

## Restoring — Scenario B: existing project, partial corruption

Use this when the project itself is fine but specific tables or storage objects are wrong (accidental UPDATE, accidental DELETE, etc.).

### B1. Decrypt the DB dump locally (keep target S3 keys you don't need this scenario)

```bash
# Need .env.backup with BACKUP_PASSPHRASE
source .env.backup
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in backups/weekly-2026-05-10/db/full.dump.enc \
  -out /tmp/full.dump \
  -pass env:BACKUP_PASSPHRASE
```

### B2. Restore a single table into a staging schema

```bash
psql "$SUPABASE_DB_URL" -c 'create schema if not exists restore_staging;'
pg_restore \
  --data-only \
  --schema=public \
  --table=items \
  -d "$SUPABASE_DB_URL" \
  /tmp/full.dump \
  --use-list <(pg_restore -l /tmp/full.dump | grep 'TABLE DATA public items')
```

### B3. Merge or replace

For full table replacement (destructive — be sure):
```sql
truncate public.items cascade;
-- Then re-run pg_restore --data-only --table=items into public.items.
```

For merge / cherry-pick:
```sql
insert into public.items
select * from restore_staging.items s
where s.id not in (select id from public.items);
```

Always inside a transaction:
```sql
begin;
-- … operations …
-- verify
select count(*) from public.items;
commit;  -- or rollback
```

### B4. Restore missing storage objects only

```bash
# Decrypt and extract one bucket from the backup:
mkdir -p /tmp/restore-storage
tar --use-compress-program='zstd -d --long=31' \
  -xf backups/weekly-2026-05-10/storage/photo-group-media.tar.zst \
  -C /tmp/restore-storage

# Then rclone copy with --ignore-existing so we only add what's missing:
rclone copy /tmp/restore-storage/photo-group-media supabase:photo-group-media \
  --config <(echo "[supabase]"; echo "type=s3"; echo "provider=Other"; \
              echo "access_key_id=$SUPABASE_S3_ACCESS_KEY_ID"; \
              echo "secret_access_key=$SUPABASE_S3_SECRET_ACCESS_KEY"; \
              echo "endpoint=$SUPABASE_S3_ENDPOINT"; \
              echo "region=$SUPABASE_S3_REGION"; \
              echo "force_path_style=true") \
  --ignore-existing
```

Cleanup:
```bash
rm -rf /tmp/restore-storage /tmp/full.dump
```

---

## Test-restore drill

**Do this once, immediately after the baseline.** It is the single most valuable thing you can do.

1. Create a throwaway free Supabase project. Name it `dealz-restore-drill-YYYYMMDD`.
2. Run Scenario A end-to-end against it, timing the whole thing with a stopwatch.
3. Smoke-test the four checks (login, QR scan, photo, ID document).
4. Record the wall-clock duration in this runbook below — that is your **RTO** (Recovery Time Objective).
5. Pause and delete the throwaway project to free up your free-tier slot.

**RTO measured: _____ minutes** ← fill in after the drill.

If you skip this drill, the backups are unverified. Don't skip it.

---

## Troubleshooting

### `pg_dump: server version mismatch`
Your local pg_dump is older than the Supabase server. Install Postgres 17:
```bash
brew install postgresql@17 && brew link --force postgresql@17 --overwrite
```

### `permission denied for schema auth`
You're using the pooler URL or a non-superuser. The DB URL must be the **direct connection** (port 5432), and the password must be the project's actual `postgres` user password.

### `rclone: ListObjects: 403 Forbidden`
The S3 access key isn't valid for that bucket, or you've mistyped the endpoint. Re-verify in Storage → Settings → S3 Connection.

### Decryption fails: `bad decrypt`
Wrong passphrase. Try the printed copy in your safe. There is no recovery without it.

### `supabase functions deploy` fails on restore
Run `supabase login` first. The deploy step requires an access token; this is separate from the DB and S3 credentials.

### Cron deactivated / forgot to run for weeks
Run `./scripts/backup/weekly.sh` now. The weekly cadence is a discipline, not a hard requirement; one fresh backup is much better than zero.

---

## Threat model & encryption

**What we're defending against**

- Accidental project deletion / pause-and-purge by Supabase.
- Database corruption from a bad migration or a buggy edge function.
- Compromise of your Supabase account.
- Compromise of your Google Drive account (someone downloads the backup folders).

**What we're NOT defending against**

- A nation-state-level adversary with physical access to your unlocked laptop.
- Your printed passphrase and your password manager being compromised at the same time.

**Encryption details**

- Algorithm: **AES-256-CBC** with **PBKDF2-SHA256, 200,000 iterations**, random salt per file (via `openssl enc -pbkdf2 -iter 200000 -salt`).
- The DB dump and ID-documents tar are encrypted at rest before leaving the laptop.
- Public-bucket photos (product / Kaitori / item-media) are not encrypted because they are already publicly readable on the live site by design.
- The encryption is **passphrase-only**. There are no keyfiles to lose, but also no key escrow — the passphrase IS the recovery key.

**Verifying a backup is decryptable**

After every backup, the script does an automatic round-trip decrypt to `/dev/null` to prove the passphrase + ciphertext are consistent. If you ever want to test it manually:

```bash
source .env.backup
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in backups/.../db/full.dump.enc \
  -out /dev/null \
  -pass env:BACKUP_PASSPHRASE
echo "exit code: $?  (0 = passphrase correct + ciphertext intact)"
```
