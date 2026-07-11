// Content Studio "dumb publisher": publishes calendar posts that are DUE (status='scheduled',
// scheduled_at <= now, not yet submitted to Blotato) — one shot, no scheduling logic.
//
// SAFETY: no-ops unless app_settings.content_publisher_enabled = true. Ships with that flag
// false AND the pg_cron job disabled, so nothing auto-posts until Joey turns it on.
//
// Idempotent: each due post is claimed by flipping status 'scheduled'->'processing' with a
// guard (blotato_submission_id IS NULL); only the worker that wins the claim publishes it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assembleSocialCaption,
  buildCaptionPrompt,
  buildIntroPrompt,
  type CaptionSpecs,
} from "../_shared/social-caption.ts";
import { searchInventory, type InventorySearchResult } from "../_shared/inventory-search.ts";
import { publishPost } from "../_shared/blotato.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BLOTATO_API_KEY = Deno.env.get("BLOTATO_API_KEY") ?? "";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isVideoUrl(u: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
}

// deno-lint-ignore no-explicit-any
type PostRow = { item_code?: string | null; item_codes?: string[] | null; item_specs?: any };

async function generateCaption(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  return (data?.choices?.[0]?.message?.content ?? "").toString().trim();
}

async function resolveProducts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  codes: string[],
): Promise<InventorySearchResult[]> {
  const out: InventorySearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = (raw ?? "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    try {
      const results = await searchInventory(supabase, { query: code });
      const match = results.find((r) => r.code.toUpperCase() === code) ?? null;
      if (match) {
        out.push(match);
        seen.add(code);
      }
    } catch {
      // skip unresolvable code
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function buildPostCaption(supabase: any, apiKey: string, model: string, post: PostRow): Promise<string> {
  const codes = Array.isArray(post.item_codes) && post.item_codes.length
    ? post.item_codes
    : (post.item_code ? [post.item_code] : []);
  const products = await resolveProducts(supabase, codes);
  if (products.length > 0) {
    const intro = await generateCaption(apiKey, model, buildIntroPrompt(products));
    return assembleSocialCaption(intro, products);
  }
  return await generateCaption(
    apiKey,
    model,
    buildCaptionPrompt((post.item_specs ?? {}) as CaptionSpecs, post.item_code ?? ""),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Kill switch — hard stop unless explicitly enabled.
    const { data: flag } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "content_publisher_enabled")
      .maybeSingle();
    if (flag?.value !== true) {
      return json({ skipped: true, reason: "content_publisher_enabled is not true" });
    }

    const { data: provider } = await supabase
      .from("ai_providers")
      .select("model_id, api_key_encrypted")
      .eq("is_active", true)
      .eq("purpose", "messaging")
      .maybeSingle();
    if (!provider) return json({ error: "No active AI provider (purpose=messaging)" }, 400);
    if (!BLOTATO_API_KEY) return json({ error: "BLOTATO_API_KEY not configured" }, 400);

    const nowISO = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("social_media_posts")
      .select(
        "id, item_code, item_codes, caption, media_urls, account_id, page_id, platform, scheduled_at, item_specs, content_item_id",
      )
      .eq("status", "scheduled")
      .is("blotato_submission_id", null)
      .lte("scheduled_at", nowISO);
    if (error) return json({ error: error.message }, 500);
    if (!due || due.length === 0) return json({ processed: 0, published: 0, failed: 0 });

    let published = 0, failed = 0, skipped = 0;
    for (const post of due) {
      // Idempotent claim: only the worker that flips scheduled->processing proceeds.
      const { data: claimed } = await supabase
        .from("social_media_posts")
        .update({ status: "processing" })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .is("blotato_submission_id", null)
        .select("id");
      if (!claimed || claimed.length === 0) {
        skipped++;
        continue;
      }
      try {
        let caption = (post.caption ?? "").trim();
        if (!caption) {
          caption = await buildPostCaption(supabase, provider.api_key_encrypted, provider.model_id, post as PostRow);
        }
        const media: string[] = Array.isArray(post.media_urls) ? post.media_urls : [];
        const result = await publishPost(fetch, {
          apiKey: BLOTATO_API_KEY,
          accountId: post.account_id,
          pageId: post.page_id,
          platform: post.platform,
          text: caption,
          mediaUrls: media,
          mediaType: media.some(isVideoUrl) ? "reel" : undefined,
          scheduledTime: null, // publish now — the calendar (not Blotato) is the scheduler
          useNextFreeSlot: false,
        });
        if (result.error || !result.submissionId) {
          await supabase
            .from("social_media_posts")
            .update({ status: "failed", error_message: result.error ?? "no submission id from Blotato", caption })
            .eq("id", post.id);
          failed++;
          continue;
        }
        // Submitted → back to 'scheduled' with a submission id; sync-social-status confirms 'published'.
        await supabase
          .from("social_media_posts")
          .update({ status: "scheduled", blotato_submission_id: result.submissionId, caption, error_message: null })
          .eq("id", post.id);
        // Bump rotation counters on the source library item.
        if (post.content_item_id) {
          const { data: ci } = await supabase
            .from("content_items")
            .select("times_posted")
            .eq("id", post.content_item_id)
            .maybeSingle();
          await supabase
            .from("content_items")
            .update({ times_posted: (ci?.times_posted ?? 0) + 1, last_posted_at: nowISO })
            .eq("id", post.content_item_id);
        }
        published++;
      } catch (e) {
        await supabase
          .from("social_media_posts")
          .update({ status: "failed", error_message: e instanceof Error ? e.message : "error" })
          .eq("id", post.id);
        failed++;
      }
    }
    return json({ processed: due.length, published, failed, skipped });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "error" }, 500);
  }
});
