import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildCustomerContext, formatContextForPrompt, getLatestCustomerImages } from "./build-ai-context.ts";
import { generateAIReply, classifyMessage, type AIProvider } from "./ai-providers.ts";
import {
  buildClassificationPrompt,
  matchSubIntent,
  resolveAutonomy,
  type SubIntentRow,
} from "./sub-intents.ts";
import { sendViaMissive } from "./send-via-missive.ts";
import { estimateCostUsd } from "./ai-cost.ts";
import { modelSupportsVision } from "./ai-vision.ts";
import { folderNameForIntent, shouldRouteOutOfInbox } from "./intent-routing.ts";
import {
  buildSpecialistSystemPrompt,
  specialistForIntent,
  type SpecialistRow,
} from "./build-specialist-prompt.ts";
import { searchInventory, deriveOfferCodes, type InventorySearchResult } from "./inventory-search.ts";
import { assembleOfferReply } from "./offer-reply.ts";
import { normalizeOutboundText } from "./normalize-markdown.ts";

async function buildOfferAttachments(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
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
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
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
    .select('slug, name, intents, playbook, always_escalate, target_folder, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  const specialists = (specialistRows ?? []) as SpecialistRow[];

  // 2d. Fetch active sub-intents (joined to their specialist's slug) + the auto-send threshold.
  const { data: subIntentRows } = await supabase
    .from("messaging_sub_intents")
    .select("slug, name, recognition_cues, handling_instructions, autonomy, target_folder, is_active, sort_order, messaging_specialists!inner(slug)")
    .eq("is_active", true)
    .order("sort_order");
  const subIntents: SubIntentRow[] = ((subIntentRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    specialist_slug: (r.messaging_specialists as { slug: string }).slug,
    slug: String(r.slug),
    name: String(r.name),
    recognition_cues: String(r.recognition_cues ?? ""),
    handling_instructions: String(r.handling_instructions ?? ""),
    autonomy: r.autonomy as SubIntentRow["autonomy"],
    target_folder: (r.target_folder as string | null) ?? null,
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order ?? 0),
  }));

  const { data: thrRow } = await supabase
    .from("system_settings").select("value").eq("key", "auto_send_confidence_threshold").maybeSingle();
  const autoSendThreshold = Number((thrRow as { value?: string } | null)?.value ?? "0.85");

  // Build full system prompt: guardrails → persona → specialist playbooks → shared knowledge.
  const fullSystemPrompt = buildSpecialistSystemPrompt({
    guardrails,
    personaSystemPrompt: persona.system_prompt,
    knowledge,
    specialists,
  });

  // 3. Build customer context
  const context = await buildCustomerContext(supabase as ReturnType<typeof createClient>, customerId, conversationId);
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
    ? await getLatestCustomerImages(supabase as ReturnType<typeof createClient>, conversationId, 3)
    : [];

  // 4c. CLASSIFY pass (cheap, no tools). Determines intent + sub-intent + confidence, which in turn
  // decides autonomy. Doing this first means an OFF sub-intent never pays for reply generation.
  const classifyPrompt = buildClassificationPrompt({ specialists, subIntents });
  let classification;
  try {
    const res = await classifyMessage(provider as AIProvider, classifyPrompt, contextBlock, chatMessages, latestImages);
    classification = res.classification;
    // Best-effort usage log for the classify call.
    try {
      await supabase.from("ai_usage_log").insert({
        conversation_id: conversationId, purpose: "messaging_classify",
        provider: (provider as AIProvider).provider, model_id: (provider as AIProvider).model_id,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
        estimated_cost_usd: estimateCostUsd((provider as AIProvider).model_id, res.usage),
        had_images: latestImages.length > 0,
      });
    } catch (e) { console.error("classify usage log failed (non-fatal):", e); }
  } catch (err) {
    // Classify failed — fail safe to a low-confidence unknown so autonomy resolves to DRAFT.
    console.error("classify pass failed (non-fatal, defaulting to DRAFT):", err);
    classification = { intent: "unknown", sub_intent_slug: null, confidence: 0 };
  }

  const classifiedSpecialist = specialistForIntent(classification.intent, specialists);
  const matchedSubIntent = matchSubIntent(
    classifiedSpecialist?.slug ?? null, classification.sub_intent_slug, subIntents,
  );
  const autonomy = resolveAutonomy({
    subIntent: matchedSubIntent, confidence: classification.confidence,
    specialist: classifiedSpecialist, autoSendThreshold,
  });

  // 4c-bis. Resolve the topic folder: sub-intent override -> category home -> legacy intent map.
  const targetFolderName =
    matchedSubIntent?.target_folder ??
    classifiedSpecialist?.target_folder ??
    folderNameForIntent(classification.intent);

  // 4d. OFF — do not draft. Route to the topic folder + flag for a human (it surfaces in the
  // Action Required queue, which is just the needs_human_review filter), then stop.
  if (autonomy === "OFF") {
    await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, true);
    return;
  }

  // 5. Generate AI reply
  // Tool executor: the AI calls search_inventory; we run it in-process via the RPCs.
  // Accumulate results by code so a later phase can attach the offered product's photo.
  // The tool is offered on every OpenRouter call; the playbook + INVENTORY_RESPONSE_RULE gate it to SPECIFIC product asks, so non-sales intents simply never call it.
  const offerCatalog = new Map<string, InventorySearchResult>();
  const executeTool = async (name: string, args: unknown): Promise<unknown> => {
    if (name !== 'search_inventory') return { error: `unknown tool: ${name}` };
    const a = (args ?? {}) as Record<string, unknown>;
    const results = await searchInventory(supabase as ReturnType<typeof createClient>, {
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

  // Append the matched sub-intent's handling as a high-priority addendum so the reply follows it
  // (e.g. promo_raffle: "do NOT search inventory"). Falls back to the base prompt for category-default.
  const replySystemPrompt = matchedSubIntent
    ? `${fullSystemPrompt}\n\n# Active sub-intent: ${matchedSubIntent.name} (HIGHEST PRIORITY)\n${matchedSubIntent.handling_instructions}`
    : fullSystemPrompt;

  const aiResponse = await generateAIReply(
    provider as AIProvider,
    replySystemPrompt,
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

  // 6. Human-review flag for DRAFT/SEND. The classify pass already escalates novel/low-confidence
  // cases to DRAFT; here we decide whether that DRAFT also needs a human's eye.
  const needsReview =
    classification.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    classifiedSpecialist === null ||
    classifiedSpecialist.always_escalate === true;

  // 7. Assemble the final reply (offer codes + emoji block), unchanged.
  const offerCodes = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog);
  const offerAttachments = offerCodes.length
    ? await buildOfferAttachments(supabase, conversationId, offerCodes, offerCatalog)
    : [];
  // Strip any Markdown the model emitted (despite the no-markdown rule) so the stored
  // DRAFT, the staff preview, and the sent message are all identical plain text.
  const finalReply = normalizeOutboundText(assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog));

  // 7b. Insert the assistant message as a DRAFT (the canonical content row). For SEND we transmit
  // it below and stamp auto_sent; for DRAFT it simply waits for staff approval (today's behavior).
  const { data: inserted } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: finalReply,
    status: "DRAFT",
    message_type: "REPLY",
    ai_confidence: aiResponse.confidence,
    attachments: offerAttachments,
    ai_context_summary: JSON.stringify({
      intent: classification.intent,
      sub_intent_slug: classification.sub_intent_slug,
      autonomy,
      classify_confidence: classification.confidence,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
      offer_codes: offerCodes,
    }),
  }).select("id").single();

  // 7c. SEND — transmit immediately via the shared Missive sender (auto-approve this draft).
  if (autonomy === "SEND" && inserted?.id) {
    const sendResult = await sendViaMissive(supabase, {
      conversationId,
      content: finalReply,
      attachments: offerAttachments,
      approveDraftId: inserted.id,
      sentBy: null,        // system actor
      autoSent: true,
    });
    if (!sendResult.ok) {
      // Delivery failed — leave it as a draft for a human and flag it. sendViaMissive already
      // marked the draft FAILED; surface it for review rather than silently dropping.
      console.error("auto-send failed, leaving as draft for human:", sendResult.error);
      await supabase.from("messages").update({ status: "DRAFT" }).eq("id", inserted.id);
      await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, true);
      return;
    }
    // On success sendViaMissive already cleared needs_human_review + draft_pending_since and
    // routed nothing; still apply topic-folder routing for consistency.
    await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, false);
    return;
  }

  // 8. DRAFT — route to the topic folder + set review flag (today's behavior).
  await routeAndFlag(supabase, conversationId, customerId, classification.intent, targetFolderName, needsReview || !customerId);
}

/**
 * Persist ai_intent + needs_human_review and, best-effort, move the conversation into its resolved
 * topic folder (triage-out-of-inbox-only). The caller resolves targetFolderName from the taxonomy
 * (sub-intent override -> category home -> legacy intent map). Extracted so the OFF, SEND, and DRAFT
 * branches share one routing implementation. `needs_human_review` is the Action Required signal.
 */
async function routeAndFlag(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  conversationId: string,
  _customerId: string | null,
  intent: string,
  targetFolderName: string | null,
  needsHumanReview: boolean,
): Promise<void> {
  const conversationUpdate: Record<string, unknown> = {
    needs_human_review: needsHumanReview,
    ai_intent: intent,
  };
  if (targetFolderName) {
    try {
      const { data: folders, error: foldersErr } = await supabase
        .from("message_folders").select("id, name").in("name", ["Inbox", targetFolderName]);
      if (foldersErr) console.error("Intent routing: folder lookup failed (non-fatal):", foldersErr);
      const folderRows = (folders ?? []) as Array<{ id: string; name: string }>;
      const inboxId = folderRows.find((f) => f.name === "Inbox")?.id ?? null;
      const targetId = folderRows.find((f) => f.name === targetFolderName)?.id ?? null;
      const { data: convo, error: convoErr } = await supabase
        .from("conversations").select("folder_id").eq("id", conversationId).maybeSingle();
      if (convoErr) console.error("Intent routing: current-folder lookup failed (non-fatal):", convoErr);
      const currentFolderId = (convo as { folder_id: string | null } | null)?.folder_id ?? null;
      if (!convoErr && shouldRouteOutOfInbox(currentFolderId, inboxId, targetId)) {
        conversationUpdate.folder_id = targetId;
      }
    } catch (routeErr) {
      console.error("Intent routing failed (non-fatal):", routeErr);
    }
  }
  await supabase.from("conversations").update(conversationUpdate).eq("id", conversationId);
}
