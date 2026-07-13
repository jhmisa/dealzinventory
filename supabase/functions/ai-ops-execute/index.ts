// AI Ops Harness: THE single execution path for approved proposals.
// Reuses the battle-tested _shared sendViaMissive pipeline (normalization, Missive API,
// needs_human_review clearing) — one send boundary shared by human-approved (cockpit,
// staff JWT) and AUTO (MCP server, service key) callers.
// Spec: docs/superpowers/specs/2026-07-13-ai-ops-harness-design.md
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaMissive } from "../_shared/send-via-missive.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  // Always return 200 JSON so supabase.functions.invoke() surfaces our error field.
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    const body = await req.json().catch(() => null) as { proposal_id?: string; content?: string } | null;
    if (!body?.proposal_id) return json({ error: 'proposal_id is required' });

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    // deno-lint-ignore no-explicit-any
    const service = createClient<any>(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Reviewer identity: present when the cockpit (staff JWT) calls; absent for AUTO (service key).
    let reviewedBy: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await caller.auth.getUser();
      reviewedBy = data?.user?.id ?? null;
    }

    // Kill-switch — every execution passes through this gate.
    const { data: ks } = await service
      .from('system_settings').select('value').eq('key', 'ai_ops_enabled').maybeSingle();
    if (ks?.value !== 'true') return json({ error: 'AI Ops is disabled (kill-switch)' });

    const { data: proposal, error: pErr } = await service
      .from('ai_ops_proposals').select('*').eq('id', body.proposal_id).maybeSingle();
    if (pErr || !proposal) return json({ error: `Proposal not found: ${pErr?.message ?? body.proposal_id}` });
    if (!['PENDING', 'APPROVED'].includes(proposal.status)) {
      return json({ error: `Proposal is ${proposal.status}, not executable` });
    }
    if (proposal.type !== 'reply') return json({ error: `Unsupported proposal type: ${proposal.type}` });

    const conversationId = proposal.payload?.conversation_id as string | undefined;
    const content = body.content ?? (proposal.payload?.content as string | undefined);
    if (!conversationId || !content) return json({ error: 'Proposal payload is missing conversation_id or content' });

    // Persist an edited body onto the proposal BEFORE sending, so the record shows what went out.
    if (body.content && body.content !== proposal.payload?.content) {
      await service.from('ai_ops_proposals')
        .update({ payload: { ...proposal.payload, content: body.content } })
        .eq('id', proposal.id);
    }

    const result = await sendViaMissive(service, {
      conversationId,
      content,
      sentBy: reviewedBy,
      autoSent: !reviewedBy,
    });

    const now = new Date().toISOString();
    if (!result.ok) {
      await service.from('ai_ops_proposals').update({
        status: 'FAILED', error: result.error ?? 'send failed',
        reviewed_by: reviewedBy, reviewed_at: now,
      }).eq('id', proposal.id);
      return json({ error: result.error ?? 'send failed' });
    }
    await service.from('ai_ops_proposals').update({
      status: 'EXECUTED', executed_at: now, reviewed_by: reviewedBy, reviewed_at: now,
      target_ref: result.messageId ?? conversationId, error: null,
    }).eq('id', proposal.id);
    await service.from('ai_ops_activity').insert({
      tool: 'execute_proposal',
      args: { proposal_id: proposal.id, edited: !!body.content, auto: !reviewedBy },
      result_summary: `sent message ${result.messageId}`,
      proposal_id: proposal.id,
    });
    return json({ ok: true, message_id: result.messageId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' });
  }
});
