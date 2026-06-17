import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCustomerContext, formatContextForPrompt, getLatestCustomerImages } from "./build-ai-context.ts";
import { generateAIReply, type AIProvider } from "./ai-providers.ts";
import { estimateCostUsd } from "./ai-cost.ts";
import { modelSupportsVision } from "./ai-vision.ts";
import { folderNameForIntent, shouldRouteOutOfInbox } from "./intent-routing.ts";
import {
  buildSpecialistSystemPrompt,
  specialistForIntent,
  type SpecialistRow,
} from "./build-specialist-prompt.ts";
import { searchInventory, type InventorySearchResult } from "./inventory-search.ts";

async function buildOfferAttachments(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  codes: string[],
  catalog: Map<string, InventorySearchResult>,
): Promise<Array<{ file_url: string; filename: string; mime_type: string; size_bytes: number }>> {
  const out: Array<{ file_url: string; filename: string; mime_type: string; size_bytes: number }> = [];
  for (const code of codes.slice(0, 3)) {
    const r = catalog.get(code);
    if (!r?.display_url) continue;
    try {
      const resp = await fetch(r.display_url);
      if (!resp.ok) continue;
      const buf = new Uint8Array(await resp.arrayBuffer());
      const mime = resp.headers.get('content-type') ?? 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const path = `ai-offer/${conversationId}/${code}_${buf.byteLength}.${ext}`;
      const { error } = await supabase.storage
        .from('messaging-attachments')
        .upload(path, buf, { contentType: mime, upsert: true });
      if (error) { console.error('offer photo upload failed (non-fatal):', error); continue; }
      out.push({ file_url: path, filename: `${code}.${ext}`, mime_type: mime, size_bytes: buf.byteLength });
    } catch (err) {
      console.error('offer photo fetch failed (non-fatal):', err);
    }
  }
  return out;
}

/**
 * Generate an AI draft reply for a conversation and save it as a DRAFT message.
 * Extracted from missive-webhook so it can be shared with the cron-triggered
 * generate-pending-drafts function.
 */
export async function generateAndSaveDraft(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  customerId: string | null,
): Promise<void> {
  // 1. Fetch active AI provider
  const { data: provider } = await supabase
    .from('ai_providers')
    .select('id, name, provider, model_id, api_key_encrypted')
    .eq('is_active', true)
    .eq('purpose', 'messaging')
    .maybeSingle();

  if (!provider) {
    // No active AI provider — skip silently
    return;
  }

  // 2. Fetch active persona
  const { data: persona } = await supabase
    .from('messaging_persona')
    .select('system_prompt')
    .eq('is_active', true)
    .maybeSingle();

  if (!persona?.system_prompt) return;

  // 2b. Fetch active guardrails + knowledge base entries (with specialist tags).
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('entry_type, title, content, specialist_tags')
    .eq('is_active', true)
    .order('sort_order');

  const entries = (kbEntries ?? []) as Array<{
    entry_type: string;
    title: string;
    content: string;
    specialist_tags: string[] | null;
  }>;
  const guardrails = entries
    .filter((e) => e.entry_type === 'guardrail')
    .map((e) => ({ title: e.title, content: e.content }));
  const knowledge = entries
    .filter((e) => e.entry_type === 'knowledge')
    .map((e) => ({ title: e.title, content: e.content, specialist_tags: e.specialist_tags ?? [] }));

  // 2c. Fetch active specialists (per-topic playbooks).
  const { data: specialistRows } = await supabase
    .from('messaging_specialists')
    .select('slug, name, intents, playbook, always_escalate, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  const specialists = (specialistRows ?? []) as SpecialistRow[];

  // Build full system prompt: guardrails → persona → specialist playbooks → shared knowledge.
  const fullSystemPrompt = buildSpecialistSystemPrompt({
    guardrails,
    personaSystemPrompt: persona.system_prompt,
    knowledge,
    specialists,
  });

  // 3. Build customer context
  const context = await buildCustomerContext(supabase, customerId, conversationId);
  const contextBlock = formatContextForPrompt(context);

  // 4. Prepare message history for AI
  const chatMessages = context.recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 4b. Fetch the latest customer screenshots (if any) for multimodal context.
  // Only do the storage I/O when the active model can actually use images,
  // which also keeps the had_images telemetry below accurate.
  const supportsVision = modelSupportsVision(
    (provider as AIProvider).provider,
    (provider as AIProvider).model_id,
  );
  const latestImages = supportsVision
    ? await getLatestCustomerImages(supabase, conversationId, 3)
    : [];

  // 5. Generate AI reply
  // Tool executor: the AI calls search_inventory; we run it in-process via the RPCs.
  // Accumulate results by code so a later phase can attach the offered product's photo.
  const offerCatalog = new Map<string, InventorySearchResult>();
  const executeTool = async (name: string, args: unknown): Promise<unknown> => {
    if (name !== 'search_inventory') return { error: `unknown tool: ${name}` };
    const a = (args ?? {}) as Record<string, unknown>;
    const results = await searchInventory(supabase, {
      query: String(a.query ?? ''),
      category_id: a.category_id ? String(a.category_id) : undefined,
      brand: a.brand ? String(a.brand) : undefined,
      price_min: a.price_min != null ? Number(a.price_min) : undefined,
      price_max: a.price_max != null ? Number(a.price_max) : undefined,
    });
    for (const r of results) offerCatalog.set(r.code, r);
    // Return a compact shape for the model (include order_url so it can paste the link).
    return results.map((r) => ({
      type: r.type, code: r.code, description: r.description,
      grade: r.grade, price: r.price, available_count: r.available_count, order_url: r.order_url,
    }));
  };

  const aiResponse = await generateAIReply(
    provider as AIProvider,
    fullSystemPrompt,
    contextBlock,
    chatMessages,
    latestImages,
    executeTool,
  );

  // 5b. Record token usage + estimated cost (best-effort; never block the draft).
  try {
    const usage = aiResponse.usage ?? { input_tokens: 0, output_tokens: 0 };
    await supabase.from('ai_usage_log').insert({
      conversation_id: conversationId,
      purpose: 'messaging',
      provider: (provider as AIProvider).provider,
      model_id: (provider as AIProvider).model_id,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      estimated_cost_usd: estimateCostUsd((provider as AIProvider).model_id, usage),
      had_images: latestImages.length > 0,
    });
  } catch (logErr) {
    console.error('ai_usage_log insert failed (non-fatal):', logErr);
  }

  // 6. Determine if human review is needed. The matched specialist's always_escalate flag is the
  // authoritative, DB-editable escalation rule (Aftersales + Kaitori escalate by default).
  // Fail-safe: if no specialist matches the classified intent (off-list intent, or an empty/
  // all-inactive specialists table), escalate rather than let an unclassifiable message pass.
  const matchedSpecialist = specialistForIntent(aiResponse.intent, specialists);
  const needsReview =
    aiResponse.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    matchedSpecialist === null ||
    matchedSpecialist.always_escalate === true;

  // 7. Save draft message
  const offerCodes = aiResponse.offer_codes ?? [];
  const offerAttachments = offerCodes.length
    ? await buildOfferAttachments(supabase, conversationId, offerCodes, offerCatalog)
    : [];

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: aiResponse.reply,
    status: 'DRAFT',
    message_type: 'REPLY',
    ai_confidence: aiResponse.confidence,
    attachments: offerAttachments,
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
      offer_codes: offerCodes,
    }),
  });

  // 8. Route by intent + update conversation state.
  // Always persist the classified intent + review flag; conditionally move the conversation
  // into its mapped folder (triage-out-of-inbox-only). Routing is best-effort: any lookup
  // failure falls back to updating intent + review flag without moving.
  const conversationUpdate: Record<string, unknown> = {
    needs_human_review: needsReview || !customerId,
    ai_intent: aiResponse.intent,
  };

  const targetFolderName = folderNameForIntent(aiResponse.intent);
  if (targetFolderName) {
    try {
      // Resolve Inbox + target folder ids by name (ids are random per-env; name is the stable key).
      const { data: folders, error: foldersErr } = await supabase
        .from('message_folders')
        .select('id, name')
        .in('name', ['Inbox', targetFolderName]);
      if (foldersErr) console.error('Intent routing: folder lookup failed (non-fatal):', foldersErr);
      const folderRows = (folders ?? []) as Array<{ id: string; name: string }>;
      const inboxId = folderRows.find((f) => f.name === 'Inbox')?.id ?? null;
      const targetId = folderRows.find((f) => f.name === targetFolderName)?.id ?? null;

      // Read the conversation's current folder to enforce triage-out-of-inbox-only.
      const { data: convo, error: convoErr } = await supabase
        .from('conversations')
        .select('folder_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (convoErr) console.error('Intent routing: current-folder lookup failed (non-fatal):', convoErr);
      const currentFolderId = (convo as { folder_id: string | null } | null)?.folder_id ?? null;

      // Only move if we actually confirmed the current folder — a failed read must not be
      // treated as "unfiled" and trigger a move.
      if (!convoErr && shouldRouteOutOfInbox(currentFolderId, inboxId, targetId)) {
        conversationUpdate.folder_id = targetId;
      }
    } catch (routeErr) {
      console.error('Intent routing failed (non-fatal):', routeErr);
    }
  }

  await supabase
    .from('conversations')
    .update(conversationUpdate)
    .eq('id', conversationId);
}
