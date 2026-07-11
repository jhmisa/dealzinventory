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
