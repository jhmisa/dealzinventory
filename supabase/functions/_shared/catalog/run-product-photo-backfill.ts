// supabase/functions/_shared/catalog/run-product-photo-backfill.ts
// One-off backfill runner: reads public.product_photo_jobs and calls save-product-photos per job,
// throttled. Optional BACKFILL_LIMIT caps how many jobs run (for bounded validation). Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BACKFILL_LIMIT=10 \
//   deno run --allow-env --allow-net supabase/functions/_shared/catalog/run-product-photo-backfill.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// SAFETY BRAKE (added 2026-06-30 during product_media recovery; hardened after a stray autonomous
// background agent kept respawning the runner with BACKFILL_ARMED=1 and raced the recovery).
// The runner now refuses to run unless BACKFILL_RECOVERY_OK=1 is set. The old respawn commands
// only set BACKFILL_ARMED=1, so they hit this brake and exit as clean no-ops. When re-running the
// clean backfill intentionally, export BACKFILL_RECOVERY_OK=1.
if (Deno.env.get("BACKFILL_RECOVERY_OK") !== "1") {
  console.log("backfill runner DISABLED (set BACKFILL_RECOVERY_OK=1 to run intentionally). Exiting.");
  Deno.exit(0);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LIMIT = Number(Deno.env.get("BACKFILL_LIMIT") ?? "0"); // 0 = all
const THROTTLE_MS = 1600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let q = supabase.from("product_photo_jobs").select("product_id, image_url");
if (LIMIT > 0) q = q.limit(LIMIT);
const { data: jobs, error } = await q;
if (error) throw error;
console.log(`product_photo_jobs to run: ${jobs?.length ?? 0}${LIMIT ? ` (capped at ${LIMIT})` : ""}`);

let ok = 0, skipped = 0, failed = 0;
for (let i = 0; i < (jobs?.length ?? 0); i++) {
  const job = jobs![i];
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/save-product-photos`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ product_model_id: job.product_id, image_url: job.image_url }),
    });
    let out: Record<string, unknown> = {};
    try { out = await r.json(); } catch { out = { error: `non-JSON response (HTTP ${r.status})` }; }
    if (out.ok) ok++;
    else if (out.skipped) skipped++;
    else { failed++; console.warn(`fail ${job.product_id} [${r.status}]: ${out.error}`); }
  } catch (e) {
    failed++; console.warn(`error ${job.product_id}: ${String(e)}`);
  }
  if ((i + 1) % 10 === 0) console.log(`progress ${i + 1}/${jobs!.length} — ok=${ok} skip=${skipped} fail=${failed}`);
  await sleep(THROTTLE_MS);
}
console.log(`DONE — ok=${ok} skipped=${skipped} failed=${failed}`);
