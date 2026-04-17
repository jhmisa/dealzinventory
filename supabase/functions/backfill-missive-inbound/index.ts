import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Backfill inbound customer messages that never reached our webhook handler.
// Fetches messages from Missive API for each target conversation, filters to
// inbound-only (no `delivered_at`) messages newer than `since`, and inserts
// any we don't already have. Dedupe is via `missive_message_id` uniqueness.
//
// This intentionally does NOT regenerate AI drafts — we don't want to create
// draft replies for messages that have been unanswered for hours.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

interface BackfillInput {
  // ISO 8601 timestamp. Only messages newer than this are considered. Default: 24h ago.
  since?: string;
  // Our DB conversation UUID. If omitted, scans all conversations with a missive_conversation_id.
  conversation_id?: string;
  // When true, report what would be inserted without writing anything.
  dry_run?: boolean;
  // When true, return the raw Missive list response for the scoped conversation
  // so we can inspect the actual message shape. Requires conversation_id.
  debug_dump?: boolean;
  // When true, write the sync result to system_settings so the UI can display it.
  // Used by the scheduled cron and the "Run sync now" button.
  write_status?: boolean;
  // Pagination: limit the number of conversations scanned per invocation.
  batch_size?: number;
  // Pagination: skip the first N conversations (use with batch_size for batching).
  batch_offset?: number;
}

interface MissiveMessageSummary {
  id: string;
  delivered_at?: number | null;
  created_at?: number;
  from_field?: { id?: string };
}

interface MissiveMessageDetail {
  id: string;
  body?: string;
  preview?: string;
  created_at?: number;
  delivered_at?: number | null;
  from_field?: { id?: string; name?: string; address?: string };
  attachments?: Array<{
    url?: string;
    filename?: string;
    media_type?: string;
    sub_type?: string;
    size?: number;
  }>;
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (!MISSIVE_API_TOKEN) {
      return jsonResponse({ error: 'MISSIVE_API_TOKEN not configured' });
    }

    let input: BackfillInput = {};
    try {
      input = await req.json();
    } catch {
      // Accept empty body; use defaults.
    }

    const sinceMs = input.since
      ? Date.parse(input.since)
      : Date.now() - 24 * 60 * 60 * 1000;
    if (Number.isNaN(sinceMs)) {
      return jsonResponse({ error: 'Invalid `since` — must be ISO 8601 timestamp' });
    }
    const sinceSec = Math.floor(sinceMs / 1000);
    const dryRun = !!input.dry_run;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch target conversations — need contact_platform_id (customer's FB PSID)
    // to distinguish inbound from outbound on the Missive message list.
    let convQuery = supabase
      .from('conversations')
      .select('id, missive_conversation_id, customer_id, contact_platform_id')
      .not('missive_conversation_id', 'is', null)
      .order('id');
    if (input.conversation_id) {
      convQuery = convQuery.eq('id', input.conversation_id);
    }
    if (input.batch_size) {
      const offset = input.batch_offset ?? 0;
      convQuery = convQuery.range(offset, offset + input.batch_size - 1);
    }
    const { data: conversations, error: convError } = await convQuery;
    if (convError) {
      return jsonResponse({ error: `conversations query failed: ${convError.message}` });
    }

    // Debug: dump raw Missive list response so we can see actual field shapes
    if (input.debug_dump && conversations && conversations.length === 1) {
      const conv = conversations[0];
      const listRes = await fetch(
        `${MISSIVE_API_URL}/conversations/${conv.missive_conversation_id}/messages`,
        { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
      );
      const body = await listRes.text();
      return jsonResponse({
        debug: true,
        conversation_id: conv.id,
        missive_conversation_id: conv.missive_conversation_id,
        status: listRes.status,
        raw: safeParseJson(body),
      });
    }

    // Look up Inbox folder for auto-unarchive (same as webhook)
    const { data: inboxFolder } = await supabase
      .from('message_folders')
      .select('id')
      .eq('name', 'Inbox')
      .eq('is_system', true)
      .maybeSingle();
    const inboxFolderId = inboxFolder?.id ?? null;

    type Inserted = {
      conversation_id: string;
      missive_message_id: string;
      created_at: string;
      preview: string;
      attachments: number;
    };
    const inserted: Inserted[] = [];
    const skipped: Array<{ conversation_id: string; missive_message_id: string; reason: string }> = [];
    const errors: Array<{ conversation_id: string; error: string }> = [];

    // Filter out conversations with invalid missive_conversation_id (not UUID format).
    // Some legacy records have non-UUID values that always fail on the Missive API.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validConversations = (conversations ?? []).filter((c) => {
      if (!c.missive_conversation_id || !UUID_RE.test(c.missive_conversation_id)) {
        skipped.push({
          conversation_id: c.id,
          missive_message_id: '(none)',
          reason: 'invalid_missive_conversation_id',
        });
        return false;
      }
      return true;
    });

    const startTime = Date.now();
    const MAX_ELAPSED_MS = 50_000; // Break well before browser/gateway timeout
    let timedOut = false;
    let conversationsProcessed = 0;

    for (const conv of validConversations) {
      if (Date.now() - startTime > MAX_ELAPSED_MS) {
        timedOut = true;
        break;
      }
      conversationsProcessed++;
      try {
        // List messages for this conversation
        const listRes = await fetch(
          `${MISSIVE_API_URL}/conversations/${conv.missive_conversation_id}/messages`,
          { headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` } },
        );
        if (!listRes.ok) {
          errors.push({
            conversation_id: conv.id,
            error: `missive list ${listRes.status}: ${await listRes.text()}`,
          });
          continue;
        }
        const listData = await listRes.json();
        const summaries: MissiveMessageSummary[] = listData?.messages ?? [];

        // Inbound: from_field.id === customer's PSID (contact_platform_id).
        // Missive sets `delivered_at` on both directions, so direction is
        // determined by sender identity, not delivery status.
        // If we don't have contact_platform_id, fall back to "not our account"
        // heuristic: any unique from_field.id we haven't sent from.
        const customerPsid = (conv as { contact_platform_id?: string | null })
          .contact_platform_id;

        const candidates = summaries.filter((m) => {
          if ((m.created_at ?? 0) < sinceSec) return false;
          if (!m.from_field?.id) return false;
          if (customerPsid) {
            return m.from_field.id === customerPsid;
          }
          // No known PSID — skip to avoid false-positive inserts of our own sends.
          return false;
        });

        let newestMs: number | null = null;

        for (const summary of candidates) {
          // Skip if we already have it
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('missive_message_id', summary.id)
            .maybeSingle();
          if (existing) {
            skipped.push({
              conversation_id: conv.id,
              missive_message_id: summary.id,
              reason: 'already_exists',
            });
            continue;
          }

          // Fetch full detail (needed for body + attachments — list endpoint may not include them)
          const detailRes = await fetch(`${MISSIVE_API_URL}/messages/${summary.id}`, {
            headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
          });
          if (!detailRes.ok) {
            errors.push({
              conversation_id: conv.id,
              error: `missive detail ${summary.id} ${detailRes.status}`,
            });
            continue;
          }
          const detailData = await detailRes.json();
          const detail: MissiveMessageDetail =
            detailData?.messages ?? detailData?.message ?? {};

          const content = detail.body
            ? detail.body.replace(/<[^>]+>/g, '').trim()
            : detail.preview ?? '';

          const attachments = (detail.attachments ?? [])
            .filter((a) => a.url)
            .map((a) => ({
              file_url: a.url!,
              filename: a.filename ?? 'attachment',
              mime_type:
                a.media_type && a.sub_type
                  ? `${a.media_type}/${a.sub_type}`
                  : 'application/octet-stream',
              ...(a.size ? { size_bytes: a.size } : {}),
            }));

          const msgCreatedAt = detail.created_at ?? summary.created_at ?? null;
          const createdAtIso = msgCreatedAt
            ? new Date(msgCreatedAt * 1000).toISOString()
            : null;

          if (!dryRun) {
            const { error: insertError } = await supabase.from('messages').insert({
              conversation_id: conv.id,
              missive_message_id: summary.id,
              role: 'customer' as const,
              content,
              status: 'SENT' as const,
              message_type: 'REPLY' as const,
              ...(attachments.length > 0 ? { attachments } : {}),
              // Preserve original send time — the UI shows created_at as the bubble timestamp
              ...(createdAtIso ? { created_at: createdAtIso } : {}),
            });
            if (insertError) {
              errors.push({
                conversation_id: conv.id,
                error: `insert ${summary.id}: ${insertError.message}`,
              });
              continue;
            }
          }

          inserted.push({
            conversation_id: conv.id,
            missive_message_id: summary.id,
            created_at: createdAtIso ?? '(unknown)',
            preview: content.slice(0, 80),
            attachments: attachments.length,
          });

          const ms = (msgCreatedAt ?? 0) * 1000;
          if (ms && (!newestMs || ms > newestMs)) newestMs = ms;
        }

        // Update conversation state if we inserted anything (mirror webhook behavior)
        if (!dryRun && newestMs) {
          await supabase
            .from('conversations')
            .update({
              last_message_at: new Date(newestMs).toISOString(),
              is_archived: false,
              ...(inboxFolderId ? { folder_id: inboxFolderId } : {}),
            })
            .eq('id', conv.id);
        }
      } catch (e) {
        errors.push({
          conversation_id: conv.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const result = {
      ok: true,
      dry_run: dryRun,
      since: new Date(sinceMs).toISOString(),
      conversations_scanned: conversations?.length ?? 0,
      inserted_count: inserted.length,
      skipped_count: skipped.length,
      error_count: errors.length,
      conversations_remaining: timedOut ? validConversations.length - conversationsProcessed : 0,
      inserted,
      skipped,
      errors,
    };

    // Write sync status to system_settings for the Settings UI
    if (input.write_status && !dryRun) {
      const status = inserted.length > 0
        ? 'recovered'       // success takes priority — we did recover messages
        : errors.length > 0
          ? 'error'          // only errors, no recoveries
          : 'ok';           // nothing to recover, no errors
      await supabase.from('system_settings').upsert(
        {
          key: 'messaging_last_sync',
          value: JSON.stringify({
            status,
            checked_at: new Date().toISOString(),
            since: new Date(sinceMs).toISOString(),
            conversations_scanned: conversations?.length ?? 0,
            conversations_remaining: timedOut ? validConversations.length - conversationsProcessed : 0,
            inserted_count: inserted.length,
            error_count: errors.length,
            inserted_preview: inserted.slice(0, 5),
            errors_preview: errors.slice(0, 3),
          }),
        },
        { onConflict: 'key' },
      );
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('FATAL backfill-missive-inbound error:', err);
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
