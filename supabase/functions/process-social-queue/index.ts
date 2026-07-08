// Server-side replacement for the /post + process-social-queue Claude CLI skills.
// Generates a caption (if blank) from a post's item_specs and publishes queued
// social_media_posts to Blotato. Two modes:
//   mode: "caption_only" + post_id  -> generate + persist caption, NO Blotato call (safe preview)
//   default (publish)               -> process status='queued' posts (or a single post_id)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCaptionPrompt, type CaptionSpecs } from "../_shared/social-caption.ts";
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

// Plain OpenRouter completion for a caption (no tools). Reuses the active messaging provider.
async function generateCaption(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  return (data?.choices?.[0]?.message?.content ?? "").toString().trim();
}

function isVideoUrl(u: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "caption_only" ? "caption_only" : "publish";
    const singleId: string | null = typeof body?.post_id === "string" ? body.post_id : null;

    const { data: provider } = await supabase
      .from("ai_providers")
      .select("model_id, api_key_encrypted")
      .eq("is_active", true)
      .eq("purpose", "messaging")
      .maybeSingle();
    if (!provider) return json({ error: "No active AI provider (purpose=messaging)" }, 400);

    // caption_only: generate + persist a single post's caption, no Blotato.
    if (mode === "caption_only") {
      if (!singleId) return json({ error: "post_id required for caption_only" }, 400);
      const { data: post } = await supabase
        .from("social_media_posts")
        .select("id, item_code, item_specs")
        .eq("id", singleId)
        .maybeSingle();
      if (!post) return json({ error: "post not found" }, 404);
      const caption = await generateCaption(
        provider.api_key_encrypted,
        provider.model_id,
        buildCaptionPrompt((post.item_specs ?? {}) as CaptionSpecs, post.item_code ?? ""),
      );
      await supabase.from("social_media_posts").update({ caption }).eq("id", singleId);
      return json({ ok: true, caption });
    }

    // publish: process queued posts (optionally a single post_id).
    let q = supabase
      .from("social_media_posts")
      .select(
        "id, item_code, caption, media_urls, account_id, page_id, platform, schedule_type, scheduled_at, item_specs",
      )
      .eq("status", "queued");
    if (singleId) q = q.eq("id", singleId);
    const { data: posts, error } = await q;
    if (error) return json({ error: error.message }, 500);
    if (!posts || posts.length === 0) {
      return json({ processed: 0, published: 0, scheduled: 0, failed: 0 });
    }
    if (!BLOTATO_API_KEY) return json({ error: "BLOTATO_API_KEY not configured" }, 400);

    let published = 0, scheduled = 0, failed = 0;
    for (const post of posts) {
      await supabase.from("social_media_posts").update({ status: "processing" }).eq("id", post.id);
      try {
        let caption = (post.caption ?? "").trim();
        if (!caption) {
          caption = await generateCaption(
            provider.api_key_encrypted,
            provider.model_id,
            buildCaptionPrompt((post.item_specs ?? {}) as CaptionSpecs, post.item_code ?? ""),
          );
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
          scheduledTime: post.schedule_type === "scheduled" ? post.scheduled_at : null,
          useNextFreeSlot: post.schedule_type === "next_slot",
        });
        if (result.error || !result.submissionId) {
          await supabase
            .from("social_media_posts")
            .update({ status: "failed", error_message: result.error ?? "no submission id from Blotato", caption })
            .eq("id", post.id);
          failed++;
          continue;
        }
        // Immediate + next_slot posts also land as 'scheduled' here; sync-social-status
        // flips them to 'published' once Blotato confirms.
        await supabase
          .from("social_media_posts")
          .update({
            status: "scheduled",
            blotato_submission_id: result.submissionId,
            caption,
            error_message: null,
          })
          .eq("id", post.id);
        if (post.schedule_type === "scheduled") scheduled++;
        else published++;
      } catch (e) {
        await supabase
          .from("social_media_posts")
          .update({ status: "failed", error_message: e instanceof Error ? e.message : "error" })
          .eq("id", post.id);
        failed++;
      }
    }
    return json({ processed: posts.length, published, scheduled, failed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "error" }, 500);
  }
});
