import { supabase } from '@/lib/supabase'
import type { Item, ItemInsert, ItemUpdate, ItemCost, ItemMedia } from '@/lib/types'

interface ItemFilters {
  search?: string
  status?: string
  grade?: string
  source?: string
  supplierId?: string
}

export async function getItems(filters: ItemFilters = {}) {
  let query = supabase
    .from('items')
    .select(`
      *,
      suppliers(supplier_name),
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, os_family, short_description)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.ilike('item_code', `%${filters.search}%`)
  }
  if (filters.status) {
    query = query.eq('item_status', filters.status)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }
  if (filters.source) {
    query = query.eq('source_type', filters.source)
  }
  if (filters.supplierId) {
    query = query.eq('supplier_id', filters.supplierId)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export async function getItem(id: string) {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      suppliers(supplier_name, supplier_type),
      product_models(*, categories(name, form_fields, description_fields), product_media(id, file_url, role, sort_order)),
      item_costs(id, description, amount, created_at),
      item_media(id, file_url, description, sort_order, visible, created_at)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getItemByCode(code: string) {
  const { data, error } = await supabase
    .from('items')
    .select('id, item_code')
    .eq('item_code', code)
    .single()

  if (error) throw error
  return data
}

export async function generateItemCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'P',
    seq_name: 'p_code_seq',
  })

  if (error) throw error
  return data as string
}

export async function createItem(item: ItemInsert) {
  const { data, error } = await supabase
    .from('items')
    .insert(item)
    .select()
    .single()

  if (error) throw error
  return data as Item
}

export async function createBulkItems(items: ItemInsert[]) {
  const { data, error } = await supabase
    .from('items')
    .insert(items)
    .select()

  if (error) throw error
  return data as Item[]
}

export async function updateItem(id: string, updates: ItemUpdate) {
  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Item
}

export async function getItemStats() {
  const { data, error } = await supabase
    .from('items')
    .select('item_status')

  if (error) throw error

  const stats = { INTAKE: 0, AVAILABLE: 0, RESERVED: 0, REPAIR: 0, MISSING: 0, SOLD: 0, total: 0 }
  for (const item of data ?? []) {
    stats[item.item_status as keyof typeof stats]++
    stats.total++
  }
  return stats
}

// --- Item Costs ---

export async function addItemCost(itemId: string, description: string, amount: number) {
  const { data, error } = await supabase
    .from('item_costs')
    .insert({ item_id: itemId, description, amount })
    .select()
    .single()

  if (error) throw error
  return data as ItemCost
}

export async function deleteItemCost(costId: string) {
  const { error } = await supabase
    .from('item_costs')
    .delete()
    .eq('id', costId)

  if (error) throw error
}

// --- Item Media ---

export async function addItemMedia(itemId: string, fileUrl: string, description?: string) {
  const { data: existing } = await supabase
    .from('item_media')
    .select('sort_order')
    .eq('item_id', itemId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('item_media')
    .insert({ item_id: itemId, file_url: fileUrl, description: description ?? null, sort_order: nextOrder })
    .select()
    .single()

  if (error) throw error
  return data as ItemMedia
}

export async function updateItemMedia(mediaId: string, updates: { description?: string; visible?: boolean }) {
  const { data, error } = await supabase
    .from('item_media')
    .update(updates)
    .eq('id', mediaId)
    .select()
    .single()

  if (error) throw error
  return data as ItemMedia
}

export async function deleteItemMedia(mediaId: string) {
  const { error } = await supabase
    .from('item_media')
    .delete()
    .eq('id', mediaId)

  if (error) throw error
}

export async function getIntakeItems() {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      suppliers(supplier_name),
      product_models(brand, model_name, cpu, ram_gb, storage_gb)
    `)
    .eq('item_status', 'INTAKE')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
