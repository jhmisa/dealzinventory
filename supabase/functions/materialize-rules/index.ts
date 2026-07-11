// Content Studio Phase 2: materialise editable "ghost" posts onto the calendar for every
// active rule, up to each rule's horizon. Idempotent per (rule_id, scheduled_at).
//
// IMPORTANT: this ONLY inserts status='scheduled' posts (editable ghosts). It NEVER calls
// Blotato / never publishes. Publishing is the separate, disabled publish-due job.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { dueSlots, jstDayKey } from "./slots.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_INSERTS = 300;
const DAY_MS = 86_400_000;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Item = any;
// deno-lint-ignore no-explicit-any
type Rule = any;

function cooldownOk(item: Item, nowMs: number): boolean {
  const cd = Number(item.cooldown_days ?? 0);
  if (!cd || !item.last_posted_at) return true;
  return nowMs - Date.parse(item.last_posted_at) >= cd * DAY_MS;
}

function itemActiveOn(item: Item, dayKey: string): boolean {
  if (item.active_from && item.active_from > dayKey) return false;
  if (item.active_to && item.active_to < dayKey) return false;
  return true;
}

function orderPool(pool: Item[], strategy: string): Item[] {
  const arr = pool.slice();
  if (strategy === "newest") {
    arr.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  } else if (strategy === "random") {
    // Deterministic-ish shuffle by a hash of the id so a run is stable.
    arr.sort((a, b) => hash(a.id) - hash(b.id));
  } else {
    // lru: least-recently-posted first (never-posted first).
    arr.sort((a, b) => (msOrZero(a.last_posted_at)) - (msOrZero(b.last_posted_at)));
  }
  return arr;
}
function msOrZero(v: string | null): number {
  return v ? Date.parse(v) : 0;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const nowISO = new Date().toISOString();
    const nowMs = Date.parse(nowISO);
    const todayKey = jstDayKey(nowISO);

    const { data: rules, error: rulesErr } = await supabase
      .from("content_rules")
      .select("*")
      .eq("active", true);
    if (rulesErr) return json({ error: rulesErr.message }, 500);

    let materialized = 0;
    for (const rule of (rules ?? []) as Rule[]) {
      if (materialized >= MAX_INSERTS) break;
      // Rule active window.
      if (rule.active_from && rule.active_from > todayKey) continue;
      if (rule.active_to && rule.active_to < todayKey) continue;

      const cadence = rule.cadence ?? {};
      const days: number[] = Array.isArray(cadence.days) ? cadence.days : [];
      const time: string = typeof cadence.time === "string" ? cadence.time : "18:00";
      if (!days.length) continue;
      const horizon = Number(rule.materialize_horizon_days ?? 14);
      const slots = dueSlots(nowISO, horizon, days, time);
      if (!slots.length) continue;

      // Skip slots already materialised for this rule (idempotent by millisecond).
      const { data: existing } = await supabase
        .from("social_media_posts")
        .select("scheduled_at")
        .eq("rule_id", rule.id)
        .gte("scheduled_at", nowISO);
      const existingMs = new Set((existing ?? []).map((r) => Date.parse((r as { scheduled_at: string }).scheduled_at)));
      const openSlots = slots.filter((s) => !existingMs.has(Date.parse(s)));
      if (!openSlots.length) continue;

      // Eligible pool: category match, not retired, evergreen, active-window ok, cooldown ok.
      const { data: items } = await supabase
        .from("content_items")
        .select("*")
        .eq("category_id", rule.category_id)
        .is("retired_at", null)
        .eq("is_evergreen", true);
      const pool = ((items ?? []) as Item[]).filter(
        (it) => cooldownOk(it, nowMs) && itemActiveOn(it, todayKey),
      );
      if (!pool.length) continue;
      const ordered = orderPool(pool, rule.pick_strategy ?? "lru");

      const rows: Record<string, unknown>[] = [];
      for (let k = 0; k < openSlots.length && materialized + rows.length < MAX_INSERTS; k++) {
        const item = ordered[k % ordered.length];
        const row: Record<string, unknown> = {
          origin: "rule",
          rule_id: rule.id,
          content_item_id: item.id,
          category_id: rule.category_id,
          media_urls: item.media_urls ?? [],
          item_codes: item.item_codes ?? null,
          caption: item.title,
          post_type: item.kind === "video" ? "video" : "product",
          status: "scheduled",
          schedule_type: "scheduled",
          scheduled_at: openSlots[k],
          platform: rule.platform ?? "facebook",
        };
        if (rule.account_id) row.account_id = rule.account_id;
        if (rule.page_id) row.page_id = rule.page_id;
        rows.push(row);
      }
      if (rows.length) {
        const { error: insErr } = await supabase.from("social_media_posts").insert(rows);
        if (!insErr) materialized += rows.length;
      }
    }
    return json({ materialized });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "error" }, 500);
  }
});
