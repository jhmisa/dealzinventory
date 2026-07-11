import { supabase } from '@/lib/supabase'
import type { ContentItem, ContentItemInsert, ContentItemUpdate, ContentItemKind } from '@/lib/types'

export interface ContentItemFilters {
  kind?: ContentItemKind
  categoryId?: string
  /** Include soft-retired items (retired_at set). Default false. */
  includeRetired?: boolean
}

export async function getContentItems(filters: ContentItemFilters = {}): Promise<ContentItem[]> {
  let query = supabase.from('content_items').select('*').order('created_at', { ascending: false })
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (!filters.includeRetired) query = query.is('retired_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ContentItem[]
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const { data, error } = await supabase.from('content_items').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ContentItem | null) ?? null
}

export async function createContentItem(input: ContentItemInsert): Promise<ContentItem> {
  const { data, error } = await supabase.from('content_items').insert(input).select().single()
  if (error) throw error
  return data as ContentItem
}

export async function updateContentItem(id: string, updates: ContentItemUpdate): Promise<ContentItem> {
  const { data, error } = await supabase.from('content_items').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data as ContentItem
}

/** Soft-retire: excluded from rotation, not deleted. */
export async function retireContentItem(id: string): Promise<ContentItem> {
  return updateContentItem(id, { retired_at: new Date().toISOString() })
}

export async function unretireContentItem(id: string): Promise<ContentItem> {
  return updateContentItem(id, { retired_at: null })
}
