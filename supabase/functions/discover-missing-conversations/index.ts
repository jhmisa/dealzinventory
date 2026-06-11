import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveNameFromMissiveConversation } from "../_shared/resolve-contact-name.ts";

// One-off recovery tool: list Missive conversations with recent activity and
// report any that have no `conversations` row in our DB. These are typically
// first-contact customers whose initial webhook delivery was lost (e.g. the
// 2026-06-10 verify_jwt outage) — the reconciliation sync can never see them
// because it only iterates conversations that already exist in the DB.
//
// POST body: { since?: ISO timestamp (default 48h ago), ingest?: boolean }
// With ingest=true, missing conversations are upserted (same shape as the
// webhook's conversation upsert) so backfill-missive-inbound can then pull
// their messages.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';
const ORG_NAME = 'Dealz K.K.';
// Our Facebook page ID — messages FROM this ID are our own outbound sends.
const DEALZ_PAGE_ID = '120712288014827';

interface MissiveConversationSummary {
  id: string;
  subject?: string | null;
  latest_message_subject?: string | null;
  last_activity_at?: number;
  created_at?: number;
  contacts?: Array<{ id?: string; name?: string | null; first_name?: string | null }>;
  authors?: Array<{ id?: string; name?: string | null }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!MISSIVE_API_TOKEN) {
      return jsonResponse({ error: 'MISSIVE_API_TOKEN not configured' });
    }

    let body: { since?: string; ingest?: boolean } = {};
    try {
      body = await req.json();
    } catch { /* defaults */ }

    const sinceMs = body.since ? Date.parse(body.since) : Date.now() - 48 * 60 * 60 * 1000;
    if (Number.isNaN(sinceMs)) {
      return jsonResponse({ error: 'Invalid `since` — must be ISO 8601 timestamp' });
    }
    const sinceSec = Math.floor(sinceMs / 1000);
    const ingest = !!body.ingest;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Page through Missive conversations (newest activity first) until we pass `since`.
    const fetched: MissiveConversationSummary[] = [];
    let until: number | null = null;
    for (let page = 0; page < 20; page++) {
      const params = new URLSearchParams({ all: 'true', limit: '50' });
      if (until) params.set('until', String(until));
      const res = await fetch(`${MISSIVE_API_URL}/conversations?${params}`, {
        headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
      });
      if (!res.ok) {
        return jsonResponse({
          error: `missive list ${res.status}: ${(await res.text()).slice(0, 300)}`,
          fetched_so_far: fetched.length,
        });
      }
      const data = await res.json();
      const convs: MissiveConversationSummary[] = data?.conversations ?? [];
      if (convs.length === 0) break;
      fetched.push(...convs);
      const oldest = convs[convs.length - 1]?.last_activity_at ?? 0;
      if (oldest < sinceSec) break;
      until = oldest;
    }

    const recent = fetched.filter((c) => (c.last_activity_at ?? 0) >= sinceSec);

    // Diff against our DB in one query.
    const ids = recent.map((c) => c.id);
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rows, error } = await supabase
        .from('conversations')
        .select('missive_conversation_id')
        .in('missive_conversation_id', ids.slice(i, i + 100));
      if (error) return jsonResponse({ error: `db query failed: ${error.message}` });
      for (const r of rows ?? []) known.add(r.missive_conversation_id as string);
    }

    // Dedupe (the `until` pagination param is inclusive, so pages can overlap).
    const missingById = new Map<string, MissiveConversationSummary>();
    for (const c of recent) {
      if (!known.has(c.id) && !missingById.has(c.id)) missingById.set(c.id, c);
    }
    const missing = [...missingById.values()];

    // Inbox folder for ingested conversations (same as webhook)
    const { data: inboxFolder } = await supabase
      .from('message_folders')
      .select('id')
      .eq('name', 'Inbox')
      .eq('is_system', true)
      .maybeSingle();

    const report = [];
    for (const conv of missing) {
      const externalContact = (conv.contacts ?? []).find(
        (c) => c.id && c.name !== ORG_NAME,
      );
      const name = resolveNameFromMissiveConversation(conv);

      // Classify channel by inspecting the conversation's messages: Facebook
      // senders have a numeric PSID in from_field.id; email senders have an
      // @-address. Only Facebook conversations belong in our messaging system
      // (the webhook rule is scoped to the FB inbox).
      let psid: string | null = externalContact?.id ?? null;
      let channel: 'facebook' | 'other' = psid ? 'facebook' : 'other';
      if (!psid) {
        const msgRes = await fetch(`${MISSIVE_API_URL}/conversations/${conv.id}/messages`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const msgs: Array<{ from_field?: { id?: string; address?: string } }> =
            msgData?.messages ?? [];
          const fbSender = msgs.find(
            (m) =>
              m.from_field?.id &&
              /^\d+$/.test(m.from_field.id) &&
              m.from_field.id !== DEALZ_PAGE_ID &&
              !(m.from_field.address ?? '').includes('@'),
          );
          if (fbSender?.from_field?.id) {
            psid = fbSender.from_field.id;
            channel = 'facebook';
          } else if (msgs.some((m) => m.from_field?.id === DEALZ_PAGE_ID)) {
            // Only our own page has messaged so far — still a FB conversation.
            channel = 'facebook';
          }
        }
      }

      const entry: Record<string, unknown> = {
        missive_conversation_id: conv.id,
        contact_name: name,
        contact_platform_id: psid,
        channel,
        last_activity_at: conv.last_activity_at
          ? new Date(conv.last_activity_at * 1000).toISOString()
          : null,
        ingested: false,
      };

      if (ingest && channel === 'facebook') {
        const { error: upsertError } = await supabase.from('conversations').upsert(
          {
            missive_conversation_id: conv.id,
            ...(name ? { contact_name: name } : {}),
            ...(psid ? { contact_platform_id: psid } : {}),
            channel: 'facebook' as const,
            unmatched_contact: true,
            needs_human_review: true,
            last_message_at: conv.last_activity_at
              ? new Date(conv.last_activity_at * 1000).toISOString()
              : new Date().toISOString(),
            is_archived: false,
            ...(inboxFolder?.id ? { folder_id: inboxFolder.id } : {}),
          },
          { onConflict: 'missive_conversation_id' },
        );
        entry.ingested = !upsertError;
        if (upsertError) entry.ingest_error = upsertError.message;
      }
      report.push(entry);
    }

    return jsonResponse({
      ok: true,
      since: new Date(sinceMs).toISOString(),
      ingest,
      missive_conversations_scanned: recent.length,
      known_count: known.size,
      missing_count: missing.length,
      missing: report,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
