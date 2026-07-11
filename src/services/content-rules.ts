import { supabase } from '@/lib/supabase'
import type { ContentRule, ContentRuleInsert, ContentRuleUpdate } from '@/lib/types'

export async function getContentRules(): Promise<ContentRule[]> {
  const { data, error } = await supabase
    .from('content_rules')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ContentRule[]
}

export async function getContentRule(id: string): Promise<ContentRule | null> {
  const { data, error } = await supabase.from('content_rules').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ContentRule | null) ?? null
}

export async function createContentRule(input: ContentRuleInsert): Promise<ContentRule> {
  const { data, error } = await supabase.from('content_rules').insert(input).select().single()
  if (error) throw error
  return data as ContentRule
}

export async function updateContentRule(id: string, updates: ContentRuleUpdate): Promise<ContentRule> {
  const { data, error } = await supabase.from('content_rules').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data as ContentRule
}

export async function setRuleActive(id: string, active: boolean): Promise<ContentRule> {
  return updateContentRule(id, { active })
}

export async function deleteContentRule(id: string): Promise<void> {
  const { error } = await supabase.from('content_rules').delete().eq('id', id)
  if (error) throw error
}

/**
 * Ask the materialiser to paint editable ghost posts onto the calendar for all active
 * rules. Fire-and-forget from the UI after a rule changes. NEVER publishes.
 */
export async function materializeRules(): Promise<{ materialized: number }> {
  const { data, error } = await supabase.functions.invoke('materialize-rules', { body: {} })
  if (error) throw error
  return (data as { materialized: number }) ?? { materialized: 0 }
}

/** rule_id → count of upcoming materialised ghost posts (for the Rules tab card). */
export async function getRuleMaterializedCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select('rule_id')
    .eq('origin', 'rule')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
  if (error) throw error
  const map = new Map<string, number>()
  for (const row of data ?? []) {
    const rid = (row as { rule_id: string | null }).rule_id
    if (rid) map.set(rid, (map.get(rid) ?? 0) + 1)
  }
  return map
}
