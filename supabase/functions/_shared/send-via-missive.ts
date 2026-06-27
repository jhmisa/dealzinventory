import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MISSIVE_API_URL = "https://public.missiveapp.com/v1";

export interface MessageAttachment {
  file_url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

export interface SendViaMissiveOpts {
  conversationId: string;
  content: string;
  attachments?: MessageAttachment[];
  approveDraftId?: string;   // when set, this draft row BECOMES the sent message
  sentBy?: string | null;    // staff user id, or null for system auto-send
  autoSent?: boolean;        // stamp messages.auto_sent on the sent row
}

export interface SendViaMissiveResult {
  ok: boolean;
  error?: string;
  messageId?: string;
  missiveMessageId?: string | null;
}

/**
 * Transmit a message to the customer via Missive and reconcile DB status.
 * Extracted from send-message so both the staff-approve handler (with a user id) and the
 * cron auto-send path (service role, no user) share one battle-tested implementation.
 */
export async function sendViaMissive(
  // deno-lint-ignore no-explicit-any
  client: SupabaseClient<any, any, any>,
  opts: SendViaMissiveOpts,
): Promise<SendViaMissiveResult> {
  // The strictly-typed client rejects object-literal `.insert()/.update()` payloads at
  // compile time. The original inline handler used an untyped (`any`-schema) client, so
  // cast back to that here — behavior and the accepted payload shapes match exactly.
  // RLS still gates rows.
  // deno-lint-ignore no-explicit-any
  const supabase = client as any;
  const MISSIVE_API_TOKEN = Deno.env.get("MISSIVE_API_TOKEN") ?? "";
  const MISSIVE_MESSENGER_ACCOUNT_ID = Deno.env.get("MISSIVE_MESSENGER_ACCOUNT_ID") ?? "";
  const { conversationId, content, attachments: inputAttachments, approveDraftId, sentBy = null, autoSent = false } = opts;

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, missive_conversation_id, contact_platform_id")
    .eq("id", conversationId)
    .single();
  if (convError || !conversation) {
    return { ok: false, error: `Conversation not found: ${convError?.message ?? "unknown"}` };
  }

  if (approveDraftId) {
    await supabase.from("messages").update({ status: "SENDING" }).eq("id", approveDraftId);
  }

  // Insert the outbound row (the "send carrier"). For an approved draft, this row is deleted on
  // success and the draft itself is marked SENT (mirrors the original handler's behavior).
  const { data: msg, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "staff" as const,
      content,
      status: "SENDING" as const,
      message_type: "REPLY" as const,
      sent_by: sentBy,
      auto_sent: autoSent,
      attachments: inputAttachments ?? [],
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: `Failed to insert message: ${insertError.message}` };

  // --- attachment guards (unchanged from the original handler) ---
  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
  const BASE64_OVERHEAD = 4 / 3;
  const MAX_PAYLOAD_BYTES = 9 * 1024 * 1024;
  if (inputAttachments && inputAttachments.length > 0) {
    for (const att of inputAttachments) {
      if (att.size_bytes && att.size_bytes > MAX_ATTACHMENT_BYTES) {
        await supabase.from("messages").update({
          status: "FAILED",
          error_details: { reason: "attachment_too_large", filename: att.filename, size_bytes: att.size_bytes, max_bytes: MAX_ATTACHMENT_BYTES },
        }).eq("id", msg.id);
        return { ok: false, error: `Attachment "${att.filename}" is too large.`, messageId: msg.id };
      }
    }
    const estimatedPayload = inputAttachments.reduce((s, a) => s + (a.size_bytes ?? 0) * BASE64_OVERHEAD, 0) + (content?.length ?? 0);
    if (estimatedPayload > MAX_PAYLOAD_BYTES) {
      await supabase.from("messages").update({
        status: "FAILED",
        error_details: { reason: "payload_too_large", estimated_payload_bytes: Math.round(estimatedPayload), max_bytes: MAX_PAYLOAD_BYTES },
      }).eq("id", msg.id);
      return { ok: false, error: "Message attachments total too large.", messageId: msg.id };
    }
  }

  // --- download attachments -> base64 (unchanged) ---
  const missiveAttachments: Array<{ base64_data: string; filename: string }> = [];
  if (inputAttachments && inputAttachments.length > 0) {
    for (const att of inputAttachments) {
      try {
        const { data: fileData, error: dErr } = await supabase.storage.from("messaging-attachments").download(att.file_url);
        if (dErr || !fileData) continue;
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        missiveAttachments.push({ base64_data: btoa(binary), filename: att.filename });
      } catch { /* skip a bad attachment, non-fatal */ }
    }
  }

  // --- Missive send (unchanged, with 20s timeout) ---
  let missiveMessageId: string | null = null;
  let sendError: { missive_status?: number; missive_error?: string; attempted_at: string; retry_count: number } | null = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    if (!MISSIVE_API_TOKEN) throw new Error("MISSIVE_API_TOKEN not configured");
    if (!conversation.contact_platform_id) throw new Error("No contact_platform_id on conversation");
    const draftPayload: Record<string, unknown> = {
      send: true,
      account: MISSIVE_MESSENGER_ACCOUNT_ID,
      body: content,
      to_fields: [{ id: conversation.contact_platform_id }],
      conversation: conversation.missive_conversation_id,
      ...(missiveAttachments.length > 0 && { attachments: missiveAttachments }),
    };
    const missiveRes = await fetch(`${MISSIVE_API_URL}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
      body: JSON.stringify({ drafts: draftPayload }),
      signal: controller.signal,
    });
    if (!missiveRes.ok) {
      sendError = { missive_status: missiveRes.status, missive_error: await missiveRes.text(), attempted_at: new Date().toISOString(), retry_count: 0 };
    } else {
      missiveMessageId = (await missiveRes.json())?.drafts?.id ?? null;
    }
  } catch (fetchErr) {
    const isTimeout = fetchErr instanceof Error && fetchErr.name === "AbortError";
    sendError = { missive_error: isTimeout ? "Missive API timeout after 20s" : (fetchErr instanceof Error ? fetchErr.message : "Network error"), attempted_at: new Date().toISOString(), retry_count: 0 };
  } finally {
    clearTimeout(timeoutId);
  }

  // --- reconcile status (unchanged) ---
  await supabase.from("messages").update({
    status: sendError ? "FAILED" : "SENT",
    ...(missiveMessageId && { missive_message_id: missiveMessageId }),
    ...(sendError && { error_details: sendError }),
  }).eq("id", msg.id);

  if (approveDraftId) {
    await supabase.from("messages").update({ status: sendError ? "FAILED" : "SENT" }).eq("id", approveDraftId);
    if (!sendError) await supabase.from("messages").delete().eq("id", msg.id);
  }

  if (!sendError) {
    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      needs_human_review: false,
      draft_pending_since: null,
    }).eq("id", conversation.id);
  }

  if (sendError) return { ok: false, error: `Message delivery failed: ${sendError.missive_error ?? "Unknown error"}`, messageId: msg.id };
  return { ok: true, messageId: approveDraftId ?? msg.id, missiveMessageId };
}
