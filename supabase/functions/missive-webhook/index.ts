import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { downloadAttachmentsToStorage } from "../_shared/download-to-storage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_WEBHOOK_SECRET = Deno.env.get('MISSIVE_WEBHOOK_SECRET') ?? '';
const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';

// Timeout for Missive API calls (ms)
const MISSIVE_API_TIMEOUT_MS = 10_000;

// ---------- Types ----------

interface MissiveWebhookPayload {
  rule: { id: string };
  conversation: {
    id: string;
    subject?: string;
    assignee_id?: string;
    authors?: Array<{ name?: string }>;
    contacts?: Array<{ name?: string; first_name?: string }>;
  };
  message: {
    id: string;
    body: string;
    preview: string;
    from_field?: {
      id?: string;
      name?: string;
      address?: string;
    };
    delivered_at?: number;
  };
}

interface CustomerMatch {
  id: string;
  customer_code: string;
  last_name: string;
  first_name: string | null;
}

// ---------- Helpers ----------

/**
 * Extract inline <img> src URLs from HTML body and return them as attachments.
 * Facebook Messenger images come as <img> tags in the Missive message body,
 * not as Missive attachments, so we need to extract them before stripping HTML.
 */
function extractInlineImages(html: string): { file_url: string; filename: string; mime_type: string }[] {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const images: { file_url: string; filename: string; mime_type: string }[] = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
      const filename = altMatch?.[1] || src.split('/').pop()?.split('?')[0] || 'image';
      images.push({
        file_url: src,
        filename,
        mime_type: 'image/jpeg',
      });
    }
  }
  return images;
}

/**
 * Strip HTML tags and also remove leftover Facebook image ID filenames.
 */
function stripHtmlAndImageFilenames(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\b\d{6,}_\d{6,}\S*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validate Missive webhook HMAC-SHA256 signature.
 */
async function validateSignature(body: string, signature: string): Promise<boolean> {
  if (!MISSIVE_WEBHOOK_SECRET || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(MISSIVE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

/**
 * Fetch with timeout using AbortController.
 */
function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = MISSIVE_API_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOptions, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/**
 * Customer matching pipeline:
 * 1. missive_contact_id (fast path)
 * 2. fb_name (manual link)
 * 3. email
 * 4. phone
 */
async function matchCustomer(
  supabase: ReturnType<typeof createClient>,
  missiveConversationId: string,
  fromName?: string,
  fromAddress?: string,
): Promise<CustomerMatch | null> {
  // 1. Check if conversation already linked to a customer
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('customer_id')
    .eq('missive_conversation_id', missiveConversationId)
    .single();

  if (existingConv?.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('id', existingConv.customer_id)
      .single();
    if (customer) return customer as CustomerMatch;
  }

  // 2. Try fb_name match
  if (fromName) {
    const { data: byFbName } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('fb_name', fromName)
      .limit(1)
      .maybeSingle();
    if (byFbName) return byFbName as CustomerMatch;
  }

  // 3. Try email match
  if (fromAddress && fromAddress.includes('@')) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('email', fromAddress)
      .limit(1)
      .maybeSingle();
    if (byEmail) return byEmail as CustomerMatch;
  }

  // 4. Try phone match
  if (fromAddress && !fromAddress.includes('@')) {
    const { data: byPhone } = await supabase
      .from('customers')
      .select('id, customer_code, last_name, first_name')
      .eq('phone', fromAddress)
      .limit(1)
      .maybeSingle();
    if (byPhone) return byPhone as CustomerMatch;
  }

  return null;
}

// ---------- Phase 2: Async processing ----------
//
// All DB writes and Missive API calls happen here, AFTER we've already
// returned 200 to Missive. This runs via EdgeRuntime.waitUntil().

async function processWebhookEvent(
  eventId: string,
  payload: MissiveWebhookPayload,
) {
  const startMs = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Mark as processing
    await supabase
      .from('webhook_events')
      .update({ status: 'processing', attempts: 1 })
      .eq('id', eventId);

    const { conversation, message } = payload;

    // Idempotency: skip if we already stored this message
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('missive_message_id', message.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('webhook_events')
        .update({
          status: 'completed',
          processing_ms: Date.now() - startMs,
          processed_at: new Date().toISOString(),
          error_message: 'duplicate — message already exists',
        })
        .eq('id', eventId);
      return;
    }

    // Customer matching (DB only — no external API calls)
    const customer = await matchCustomer(
      supabase,
      conversation.id,
      message.from_field?.name,
      message.from_field?.address,
    );

    // Resolve contact name from webhook payload fields only
    let resolvedContactName: string | null = message.from_field?.name
      ?? conversation.subject
      ?? (conversation.contacts ?? []).find((c: { name?: string }) => c.name)?.name
      ?? (conversation.contacts ?? []).find((c: { first_name?: string }) => c.first_name)?.first_name
      ?? (conversation.authors ?? []).find((a: { name?: string }) => a.name && a.name !== 'Dealz K.K.')?.name
      ?? message.from_field?.address
      ?? null;
    if (resolvedContactName?.startsWith('Message from ')) {
      resolvedContactName = resolvedContactName.slice('Message from '.length);
    }
    if (resolvedContactName) resolvedContactName = resolvedContactName.trim() || null;

    // Look up Inbox folder for auto-unarchive
    const { data: inboxFolder } = await supabase
      .from('message_folders')
      .select('id')
      .eq('name', 'Inbox')
      .eq('is_system', true)
      .single();
    const inboxFolderId = inboxFolder?.id ?? null;

    // Check if conversation already exists
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, contact_name')
      .eq('missive_conversation_id', conversation.id)
      .maybeSingle();

    // Upsert conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .upsert(
        {
          missive_conversation_id: conversation.id,
          customer_id: customer?.id ?? null,
          ...(resolvedContactName ? { contact_name: resolvedContactName } : {}),
          ...(message.from_field?.id ? { contact_platform_id: message.from_field.id } : {}),
          channel: 'facebook' as const,
          unmatched_contact: !customer,
          needs_human_review: !customer,
          last_message_at: new Date().toISOString(),
          is_archived: false,
          ...(!existingConv && inboxFolderId ? { folder_id: inboxFolderId } : {}),
        },
        { onConflict: 'missive_conversation_id' },
      )
      .select('id')
      .single();

    if (convError) throw convError;

    // Extract inline images from HTML body before stripping
    const inlineImages = message.body ? extractInlineImages(message.body) : [];

    // Extract plain text from message body
    const content = message.body
      ? stripHtmlAndImageFilenames(message.body)
      : message.preview ?? '';

    // Store inbound message
    const { data: insertedMsg, error: msgError } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      missive_message_id: message.id,
      role: 'customer' as const,
      content,
      status: 'SENT' as const,
      message_type: 'REPLY' as const,
      ...(inlineImages.length > 0 ? { attachments: inlineImages } : {}),
    })
    .select('id')
    .single();

    if (msgError) throw msgError;

    // --- AI Draft Debounce ---
    const { data: aiGlobalSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ai_messaging_enabled')
      .maybeSingle();

    const aiGlobalEnabled = aiGlobalSetting?.value === 'true';

    if (aiGlobalEnabled) {
      const { data: convState } = await supabase
        .from('conversations')
        .select('ai_enabled')
        .eq('id', conv.id)
        .single();

      if (convState?.ai_enabled !== false) {
        await supabase
          .from('conversations')
          .update({ draft_pending_since: new Date().toISOString() })
          .eq('id', conv.id);
      }
    }

    // Mark event as completed
    await supabase
      .from('webhook_events')
      .update({
        status: 'completed',
        processing_ms: Date.now() - startMs,
        processed_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    console.log('Processed webhook event', eventId, 'in', Date.now() - startMs, 'ms');

    // --- Background enrichment (contact name + attachments) ---
    // This runs after the core processing is done but still within waitUntil.
    await backgroundEnrichMessage(
      message.id,
      insertedMsg.id,
      conv.id,
      conversation.id,
      !resolvedContactName || (existingConv != null && !existingConv.contact_name),
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to process webhook event', eventId, ':', errMsg);

    // Mark event as failed
    try {
      // Use raw SQL to atomically increment attempts
      await supabase
        .from('webhook_events')
        .update({
          status: 'failed',
          error_message: errMsg.slice(0, 1000),
          processing_ms: Date.now() - startMs,
          attempts: 1, // Will be incremented properly if retried
        })
        .eq('id', eventId);
    } catch (logErr) {
      console.warn('Failed to update webhook_events status:', logErr);
    }
  }
}

// ---------- Background enrichment ----------

async function backgroundEnrichMessage(
  missiveMessageId: string,
  messageDbId: string,
  conversationDbId: string,
  missiveConversationId: string,
  needsContactName: boolean,
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Resolve contact name from Missive API (if webhook payload didn't have it)
    if (needsContactName && MISSIVE_API_TOKEN) {
      try {
        const convRes = await fetchWithTimeout(`${MISSIVE_API_URL}/conversations/${missiveConversationId}`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          const convDetail = convData?.conversations ?? convData?.conversation;
          let resolvedName: string | null =
            convDetail?.subject
            ?? convDetail?.latest_subject
            ?? (convDetail?.contacts ?? []).find((c: { name?: string }) => c.name)?.name
            ?? (convDetail?.contacts ?? []).find((c: { first_name?: string }) => c.first_name)?.first_name
            ?? (convDetail?.authors ?? []).find((a: { name?: string }) => a.name && a.name !== 'Dealz K.K.')?.name
            ?? convDetail?.latest_message?.from_field?.name
            ?? null;
          if (resolvedName?.startsWith('Message from ')) {
            resolvedName = resolvedName.slice('Message from '.length);
          }
          if (resolvedName) {
            await supabase
              .from('conversations')
              .update({ contact_name: resolvedName })
              .eq('id', conversationDbId);
            console.log('Background: resolved contact name:', resolvedName);
          }
        }
      } catch (e) {
        console.warn('Background: failed to fetch conversation from Missive API:', e);
      }
    }

    // 2. Fetch full message from Missive API to get attachments
    if (MISSIVE_API_TOKEN) {
      try {
        const msgRes = await fetchWithTimeout(`${MISSIVE_API_URL}/messages/${missiveMessageId}`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const rawAttachments = msgData?.messages?.attachments ?? msgData?.message?.attachments ?? [];
          const missiveAttachments = rawAttachments
            .filter((a: { url?: string }) => a.url)
            .map((a: { url: string; filename?: string; media_type?: string; sub_type?: string; size?: number }) => ({
              file_url: a.url,
              filename: a.filename ?? 'attachment',
              mime_type: a.media_type && a.sub_type ? `${a.media_type}/${a.sub_type}` : 'application/octet-stream',
              ...(a.size ? { size_bytes: a.size } : {}),
            }));

          // Fetch existing attachments (may include inline images from fast-path)
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('attachments')
            .eq('id', messageDbId)
            .single();
          const existing = (existingMsg?.attachments ?? []) as Array<{ file_url: string; filename: string; mime_type: string; size_bytes?: number }>;

          // Split existing into external URLs (need downloading) and already-stored paths
          const externalExisting = existing.filter(a =>
            a.file_url.startsWith('http://') || a.file_url.startsWith('https://'),
          );
          const alreadyStored = existing.filter(a =>
            !a.file_url.startsWith('http://') && !a.file_url.startsWith('https://'),
          );

          // Dedupe Missive attachments against existing external URLs
          const existingUrls = new Set(existing.map(a => a.file_url));
          const newMissiveAttachments = missiveAttachments.filter(
            (a: { file_url: string }) => !existingUrls.has(a.file_url),
          );

          // Combine all external-URL attachments that need downloading
          const toDownload = [...externalExisting, ...newMissiveAttachments];

          if (toDownload.length > 0 || alreadyStored.length !== existing.length) {
            const downloaded = await downloadAttachmentsToStorage(
              supabase,
              toDownload,
              conversationDbId,
            );

            const merged = [...alreadyStored, ...downloaded];
            await supabase
              .from('messages')
              .update({ attachments: merged })
              .eq('id', messageDbId);
            console.log('Background: persisted', downloaded.length, 'attachment(s) to storage for message', messageDbId);
          }
        } else {
          console.warn('Background: Missive message fetch failed:', msgRes.status);
        }
      } catch (e) {
        console.warn('Background: failed to fetch message attachments from Missive:', e);
      }
    }
  } catch (e) {
    console.error('Background enrichment failed:', e);
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // ---- Phase 1: Validate + queue + ACK (~50ms) ----

    // Validate webhook signature — reject if invalid
    const signature = req.headers.get('x-hook-signature') ?? '';
    if (MISSIVE_WEBHOOK_SECRET && signature) {
      const valid = await validateSignature(rawBody, signature);
      if (!valid) {
        console.error('Signature mismatch — rejecting webhook');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: MissiveWebhookPayload = JSON.parse(rawBody);
    const { conversation, message } = payload;

    const missiveMessageId = message?.id ?? null;
    const missiveConversationId = conversation?.id ?? null;

    // Debug: log key payload fields
    console.log('Webhook received:', JSON.stringify({
      conv_id: missiveConversationId,
      msg_id: missiveMessageId,
      from_name: message?.from_field?.name ?? null,
      from_addr: message?.from_field?.address ?? null,
    }));

    if (!missiveConversationId || !missiveMessageId) {
      return new Response(JSON.stringify({ error: 'Missing conversation or message data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert into webhook_events queue (idempotent via unique index)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: event, error: insertError } = await supabase
      .from('webhook_events')
      .upsert(
        {
          missive_message_id: missiveMessageId,
          missive_conversation_id: missiveConversationId,
          raw_payload: payload,
          status: 'pending',
        },
        { onConflict: 'missive_message_id', ignoreDuplicates: true },
      )
      .select('id, status')
      .maybeSingle();

    if (insertError) {
      console.error('Failed to queue webhook event:', insertError.message);
      // Still return 200 — we don't want Missive to stop sending
      return jsonResponse({ ok: false, error: 'queue_failed' });
    }

    // If upsert returned null or status isn't pending, it's a duplicate
    if (!event || event.status !== 'pending') {
      console.log('Duplicate webhook event for message:', missiveMessageId);
      return jsonResponse({ ok: true, skipped: true });
    }

    // Return 200 immediately — Phase 2 runs in the background
    const response = jsonResponse({ ok: true, queued: true, event_id: event.id });

    // ---- Phase 2: Process asynchronously ----
    EdgeRuntime.waitUntil(processWebhookEvent(event.id, payload));

    return response;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    console.error('Webhook handler error:', errMsg);
    // Always return 200 to prevent Missive from pausing webhook delivery
    return jsonResponse({ error: errMsg });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
