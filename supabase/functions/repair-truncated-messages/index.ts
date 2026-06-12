// One-off repair: re-fetch full bodies for customer messages that were stored
// from Missive's 140-char webhook preview before the truncation fix.
// Invoke with { ids: [...messages.id] } in batches; throttled per Missive limits.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

function stripHtmlAndImageFilenames(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\b\d{6,}_\d{6,}\S*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

Deno.serve(async (req) => {
  const { ids = [], delay_ms = 1500 } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: 'ids[] required' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supabase
    .from('messages')
    .select('id, missive_message_id, content')
    .in('id', ids.slice(0, 30));
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let repaired = 0, unchanged = 0, failed = 0, rate_limited = false;

  for (const msg of rows ?? []) {
    if (!msg.missive_message_id) { unchanged++; continue; }
    try {
      const res = await fetch(`${MISSIVE_API_URL}/messages/${msg.missive_message_id}`, {
        headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
      });
      if (res.status === 429) { rate_limited = true; break; }
      if (!res.ok) { failed++; continue; }

      const data = await res.json();
      const detail = data?.messages ?? data?.message ?? {};
      if (detail.body) {
        const full = stripHtmlAndImageFilenames(detail.body);
        if (full && full !== msg.content) {
          const { error: upErr } = await supabase
            .from('messages')
            .update({ content: full })
            .eq('id', msg.id);
          if (upErr) { failed++; } else { repaired++; }
        } else {
          unchanged++;
        }
      } else {
        unchanged++;
      }
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, delay_ms));
  }

  return new Response(JSON.stringify({ repaired, unchanged, failed, rate_limited }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
