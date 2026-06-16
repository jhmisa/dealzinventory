import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCustomerContext, formatContextForPrompt, getLatestCustomerImages } from "./build-ai-context.ts";
import { generateAIReply, type AIProvider } from "./ai-providers.ts";
import { estimateCostUsd } from "./ai-cost.ts";
import { modelSupportsVision } from "./ai-vision.ts";
import { folderNameForIntent, shouldRouteOutOfInbox, isEscalatingIntent } from "./intent-routing.ts";

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

  // 2b. Fetch active guardrails + knowledge base entries
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('entry_type, title, content')
    .eq('is_active', true)
    .order('sort_order');

  const entries = kbEntries ?? [];
  const guardrails = entries.filter((e: { entry_type: string }) => e.entry_type === 'guardrail');
  const knowledge = entries.filter((e: { entry_type: string }) => e.entry_type === 'knowledge');

  // Build full system prompt: guardrails → persona → knowledge
  let fullSystemPrompt = '';

  if (guardrails.length > 0) {
    const rules = guardrails
      .map((g: { title: string; content: string }, i: number) => `${i + 1}. **${g.title}**: ${g.content}`)
      .join('\n');
    fullSystemPrompt += `# Rules (NEVER violate)\n${rules}\n\n`;
  }

  fullSystemPrompt += persona.system_prompt;

  if (knowledge.length > 0) {
    const articles = knowledge
      .map((k: { title: string; content: string }) => `## ${k.title}\n${k.content}`)
      .join('\n\n');
    fullSystemPrompt += `\n\n# Knowledge Base\n${articles}`;
  }

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
  const aiResponse = await generateAIReply(
    provider as AIProvider,
    fullSystemPrompt,
    contextBlock,
    chatMessages,
    latestImages,
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

  // 6. Determine if human review is needed.
  // Sensitive intents (kaitori = money, complaint) always escalate regardless of confidence.
  const needsReview =
    aiResponse.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    isEscalatingIntent(aiResponse.intent);

  // 7. Save draft message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: aiResponse.reply,
    status: 'DRAFT',
    message_type: 'REPLY',
    ai_confidence: aiResponse.confidence,
    ai_context_summary: JSON.stringify({
      intent: aiResponse.intent,
      data_used: aiResponse.data_used,
      escalation_reason: aiResponse.escalation_reason,
      needs_clarification: aiResponse.needs_clarification ?? false,
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
      const { data: folders } = await supabase
        .from('message_folders')
        .select('id, name')
        .in('name', ['Inbox', targetFolderName]);
      const folderRows = (folders ?? []) as Array<{ id: string; name: string }>;
      const inboxId = folderRows.find((f) => f.name === 'Inbox')?.id ?? null;
      const targetId = folderRows.find((f) => f.name === targetFolderName)?.id ?? null;

      // Read the conversation's current folder to enforce triage-out-of-inbox-only.
      const { data: convo } = await supabase
        .from('conversations')
        .select('folder_id')
        .eq('id', conversationId)
        .maybeSingle();
      const currentFolderId = (convo as { folder_id: string | null } | null)?.folder_id ?? null;

      if (shouldRouteOutOfInbox(currentFolderId, inboxId, targetId)) {
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
