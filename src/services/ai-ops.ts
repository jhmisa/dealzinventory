import { supabase } from '@/lib/supabase'
import type { AiOpsProposal, AiOpsActivity, AiOpsProposalStatus, AiOpsAutonomy } from '@/lib/types'
import { updateSystemSetting } from './settings'

export async function getAiOpsProposals(status?: AiOpsProposalStatus) {
  let q = supabase
    .from('ai_ops_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AiOpsProposal[]
}

export async function getAiOpsActivity(limit = 100) {
  const { data, error } = await supabase
    .from('ai_ops_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AiOpsActivity[]
}

export async function rejectAiOpsProposal(id: string, note?: string) {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('ai_ops_proposals')
    .update({
      status: 'REJECTED',
      review_note: note ?? null,
      reviewed_by: userData?.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'PENDING')
  if (error) throw error
}

/** Dismiss an informational briefing — nothing executes, it just leaves the queue. */
export async function acknowledgeAiOpsProposal(id: string) {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('ai_ops_proposals')
    .update({
      status: 'ACKNOWLEDGED',
      reviewed_by: userData?.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'PENDING')
  if (error) throw error
}

/** Approve = execute through the single audited path (ai-ops-execute). Optional edited content. */
export async function approveAiOpsProposal(id: string, content?: string) {
  const { data, error } = await supabase.functions.invoke('ai-ops-execute', {
    body: { proposal_id: id, ...(content ? { content } : {}) },
  })
  if (error) {
    const detail = data?.error ?? error.message ?? 'Execute failed'
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data as { ok: true; message_id: string }
}

export interface AiOpsSettings {
  enabled: boolean
  replyAutonomy: AiOpsAutonomy
}

export async function getAiOpsSettings(): Promise<AiOpsSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['ai_ops_enabled', 'ai_ops_autonomy_reply'])
  if (error) throw error
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return {
    enabled: map.ai_ops_enabled === 'true',
    replyAutonomy: (map.ai_ops_autonomy_reply ?? 'PROPOSE') as AiOpsAutonomy,
  }
}

export async function setAiOpsEnabled(enabled: boolean) {
  await updateSystemSetting('ai_ops_enabled', enabled ? 'true' : 'false')
}

export async function setAiOpsReplyAutonomy(level: AiOpsAutonomy) {
  await updateSystemSetting('ai_ops_autonomy_reply', level)
}
