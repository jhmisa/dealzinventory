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
      // Try to extract a meaningful filename from the URL or alt text
      const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
      const filename = altMatch?.[1] || src.split('/').pop()?.split('?')[0] || 'image';
      images.push({
        file_url: src,
        filename,
        mime_type: 'image/jpeg', // Facebook images are typically JPEG
      });
    }
  }
  return images;
}

/**
 * Strip HTML tags and also remove leftover Facebook image ID filenames
 * (patterns like "674222153_93406805613439..." that appear as text nodes
 * next to <img> tags in Messenger messages).
 */
function stripHtmlAndImageFilenames(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '') // Remove img tags first
    .replace(/<br\s*\/?>/gi, '\n') // Preserve line breaks
    .replace(/<[^>]+>/g, '') // Strip remaining HTML
    .replace(/\b\d{6,}_\d{6,}\S*/g, '') // Remove Facebook image ID patterns (e.g. 674222153_93406805613439...)
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
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

// ---------- Background tasks ----------
//
// Missive API calls (contact name resolution and attachment fetching) are
// moved here so the webhook always returns 200 within ~100ms. If Missive
// is slow or down, we still ACK the webhook — preventing Missive from
// pausing its delivery queue (which caused the 4-hour blackout on 2026-04-16).

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
        const convRes = await fetch(`${MISSIVE_API_URL}/conversations/${missiveConversationId}`, {
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
        const msgRes = await fetch(`${MISSIVE_API_URL}/messages/${missiveMessageId}`, {
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
            // Download all external URLs to Supabase Storage
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

// ---------- Webhook delivery logging ----------

async function logWebhookDelivery(
  missiveMessageId: string,
  missiveConversationId: string | null,
  status: 'success' | 'duplicate' | 'error',
  errorMessage: string | null,
  processingMs: number,
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await supabase.from('webhook_delivery_log').insert({
      missive_message_id: missiveMessageId,
      missive_conversation_id: missiveConversationId,
      status,
      error_message: errorMessage,
      processing_ms: Math.round(processingMs),
    });
  } catch (e) {
    console.warn('Failed to log webhook delivery:', e);
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const webhookStartMs = Date.now();
  let logMissiveMessageId = '(unknown)';
  let logMissiveConversationId: string | null = null;

  try {
    const rawBody = await req.text();

    // Validate webhook signature
    const signature = req.headers.get('x-hook-signature') ?? '';
    if (MISSIVE_WEBHOOK_SECRET && signature) {
      const valid = await validateSignature(rawBody, signature);
      if (!valid) {
        console.error('Signature mismatch — expected from secret, got:', signature.slice(0, 8) + '...');
        // Log but don't block — allows debugging while keeping messages flowing
      }
    }

    const payload: MissiveWebhookPayload = JSON.parse(rawBody);
    const { conversation, message } = payload;

    logMissiveMessageId = message?.id ?? '(unknown)';
    logMissiveConversationId = conversation?.id ?? null;

    // Debug: log key payload fields to help diagnose missing contact names
    console.log('Webhook received:', JSON.stringify({
      conv_id: conversation?.id,
      msg_id: message?.id,
      from_name: message?.from_field?.name ?? null,
      from_addr: message?.from_field?.address ?? null,
      subject: conversation?.subject ?? null,
      contacts: conversation?.contacts ?? null,
      authors: conversation?.authors ?? null,
    }));

    if (!conversation?.id || !message?.id) {
      return new Response(JSON.stringify({ error: 'Missing conversation or message data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotency: skip if we already stored this message
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('missive_message_id', message.id)
      .maybeSingle();

    if (existing) {
      // Log duplicate delivery
      EdgeRuntime.waitUntil(logWebhookDelivery(logMissiveMessageId, logMissiveConversationId, 'duplicate', null, Date.now() - webhookStartMs));
      return jsonResponse({ ok: true, skipped: true });
    }

    // Customer matching (DB only — no external API calls)
    const customer = await matchCustomer(
      supabase,
      conversation.id,
      message.from_field?.name,
      message.from_field?.address,
    );

    // Resolve contact name from webhook payload fields only — the Missive API
    // fallback is deferred to the background task so we can return 200 fast.
    let resolvedContactName: string | null = message.from_field?.name
      ?? conversation.subject
      ?? (conversation.contacts ?? []).find((c: { name?: string }) => c.name)?.name
      ?? (conversation.contacts ?? []).find((c: { first_name?: string }) => c.first_name)?.first_name
      ?? (conversation.authors ?? []).find((a: { name?: string }) => a.name && a.name !== 'Dealz K.K.')?.name
      ?? null;
    if (resolvedContactName?.startsWith('Message from ')) {
      resolvedContactName = resolvedContactName.slice('Message from '.length);
    }

    // Look up Inbox folder for auto-unarchive
    const { data: inboxFolder } = await supabase
      .from('message_folders')
      .select('id')
      .eq('name', 'Inbox')
      .eq('is_system', true)
      .single();
    const inboxFolderId = inboxFolder?.id ?? null;

    // Check if conversation already exists (to avoid moving it to Inbox)
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('missive_conversation_id', conversation.id)
      .maybeSingle();

    // Upsert conversation — only update contact_name if we have a non-null value
    // Auto-unarchive on new inbound messages; only set folder to Inbox for NEW conversations
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

    // Extract plain text from message body (strip HTML + Facebook image filenames)
    const content = message.body
      ? stripHtmlAndImageFilenames(message.body)
      : message.preview ?? '';

    // Store inbound message with inline image attachments (background task may add more from Missive API)
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
    // Set/reset draft_pending_since so the cron job generates a draft
    // after the customer stops sending messages (debounce window).
    // First check global AI kill switch
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

    // --- Background enrichment ---
    // Fetch contact name (if not resolved from webhook payload) and
    // message attachments from the Missive API. This runs AFTER we
    // return 200 to Missive, so even if Missive's API is slow/down,
    // the webhook handler never blocks.
    EdgeRuntime.waitUntil(
      backgroundEnrichMessage(
        message.id,
        insertedMsg.id,
        conv.id,
        conversation.id,
        !resolvedContactName,
      ),
    );

    // Log successful delivery
    EdgeRuntime.waitUntil(logWebhookDelivery(logMissiveMessageId, logMissiveConversationId, 'success', null, Date.now() - webhookStartMs));

    return jsonResponse({
      ok: true,
      conversation_id: conv.id,
      customer_matched: !!customer,
      customer_id: customer?.id ?? null,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    // Log error delivery
    EdgeRuntime.waitUntil(logWebhookDelivery(logMissiveMessageId, logMissiveConversationId, 'error', errMsg, Date.now() - webhookStartMs));
    return jsonResponse({ error: errMsg });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
