import { supabase } from '@/lib/supabase'
import type { SellGroup, SellGroupInsert, SellGroupUpdate } from '@/lib/types'

interface SellGroupFilters {
  search?: string
  active?: boolean
  productId?: string
  grade?: string
}

export async function getSellGroups(filters: SellGroupFilters = {}) {
  let query = supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, os_family),
      sell_group_items(count)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.ilike('sell_group_code', `%${filters.search}%`)
  }
  if (filters.active !== undefined) {
    query = query.eq('active', filters.active)
  }
  if (filters.productId) {
    query = query.eq('product_id', filters.productId)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export async function getSellGroup(id: string) {
  const { data, error } = await supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(*, product_media(id, file_url, role, sort_order))
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createSellGroup(sg: SellGroupInsert) {
  const { data, error } = await supabase
    .from('sell_groups')
    .insert(sg)
    .select()
    .single()

  if (error) throw error
  return data as SellGroup
}

export async function updateSellGroup(id: string, updates: SellGroupUpdate) {
  const { data, error } = await supabase
    .from('sell_groups')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as SellGroup
}

export async function deleteSellGroup(id: string) {
  const { error } = await supabase
    .from('sell_groups')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function generateSellGroupCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'G',
    seq_name: 'g_code_seq',
  })

  if (error) throw error
  return data as string
}

// Get items assigned to a sell group
export async function getSellGroupItems(sellGroupId: string) {
  const { data, error } = await supabase
    .from('sell_group_items')
    .select(`
      id, assigned_at,
      items(id, item_code, condition_grade, item_status, inspected_at,
        product_models(brand, model_name, cpu, ram_gb, storage_gb)
      )
    `)
    .eq('sell_group_id', sellGroupId)
    .order('assigned_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Get available items that match a sell group's product + grade (AVAILABLE, not already in a sell group or order)
export async function getAvailableItems(sellGroupId: string) {
  // First get the sell group to know product_id and condition_grade
  const sg = await getSellGroup(sellGroupId)

  const { data, error } = await supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, item_status, inspected_at,
      product_models(brand, model_name, cpu, ram_gb, storage_gb)
    `)
    .eq('item_status', 'AVAILABLE')
    .eq('product_id', sg.product_id)
    .eq('condition_grade', sg.condition_grade)
    .order('inspected_at', { ascending: false })

  if (error) throw error

  // Filter out items already in any sell group or order (parallel fetch)
  const [{ data: assignedItems }, { data: orderedItems }] = await Promise.all([
    supabase.from('sell_group_items').select('item_id'),
    supabase.from('order_items').select('item_id'),
  ])

  const assignedIds = new Set((assignedItems ?? []).map(a => a.item_id))
  const orderedIds = new Set((orderedItems ?? []).map(o => o.item_id))

  return (data ?? []).filter(item => !assignedIds.has(item.id) && !orderedIds.has(item.id))
}

// Assign an item to a sell group
export async function assignItemToSellGroup(sellGroupId: string, itemId: string) {
  const { data, error } = await supabase
    .from('sell_group_items')
    .insert({ sell_group_id: sellGroupId, item_id: itemId })
    .select()
    .single()

  if (error) throw error
  return data
}

// Remove an item from a sell group
export async function removeItemFromSellGroup(sellGroupItemId: string) {
  const { error } = await supabase
    .from('sell_group_items')
    .delete()
    .eq('id', sellGroupItemId)

  if (error) throw error
}
