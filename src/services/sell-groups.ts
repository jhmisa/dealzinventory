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

// Fetch a sell group by G-code with deep joins (items, orders, customers, product media)
export async function getSellGroupByCode(gCode: string) {
  const { data: sg, error: sgError } = await supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(
        id, brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size, os_family,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      )
    `)
    .ilike('sell_group_code', gCode.trim())
    .maybeSingle()

  if (sgError) throw sgError
  if (!sg) return null

  // Fetch items in this sell group with order/customer info
  const { data: sgi, error: sgiError } = await supabase
    .from('sell_group_items')
    .select(`
      id, assigned_at,
      items(
        id, item_code, condition_grade, item_status, selling_price, purchase_price, discount, created_at,
        suppliers(supplier_name),
        product_models(brand, model_name, cpu, ram_gb, storage_gb, screen_size, categories(name, description_fields)),
        order_items(
          orders(id, order_code, order_status,
            customers(id, customer_code, first_name, last_name)
          )
        )
      )
    `)
    .eq('sell_group_id', sg.id)
    .order('assigned_at', { ascending: false })

  if (sgiError) throw sgiError

  return {
    ...sg,
    sell_group_items: sgi ?? [],
  }
}

export type SellGroupByCode = NonNullable<Awaited<ReturnType<typeof getSellGroupByCode>>>

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
      id, item_code, condition_grade, item_status, inspected_at, selling_price,
      product_models(brand, model_name, cpu, ram_gb, storage_gb, short_description)
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

// Get all AVAILABLE items not yet assigned to any sell group or order (for new sell group creation)
interface UnassignedItemFilters {
  search?: string
  grade?: string
}

export async function getUnassignedAvailableItems(filters: UnassignedItemFilters = {}) {
  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, item_status, selling_price, product_id,
      product_models(id, brand, model_name, color, cpu, ram_gb, storage_gb)
    `)
    .eq('item_status', 'AVAILABLE')
    .neq('condition_grade', 'J')
    .order('item_code', { ascending: false })

  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error } = await query

  if (error) throw error

  // Filter out items already in any sell group or order
  const [{ data: assignedItems }, { data: orderedItems }] = await Promise.all([
    supabase.from('sell_group_items').select('item_id'),
    supabase.from('order_items').select('item_id'),
  ])

  const excludedIds = new Set([
    ...(assignedItems ?? []).map(a => a.item_id),
    ...(orderedItems ?? []).map(o => o.item_id),
  ])

  let results = (data ?? []).filter(item => !excludedIds.has(item.id))

  // Client-side search across item_code, brand, and model_name (Supabase .or() doesn't support foreign table columns)
  if (filters.search) {
    const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
    results = results.filter(item => {
      const pm = item.product_models as { brand: string; model_name: string; color: string } | null
      const text = [
        item.item_code,
        pm?.brand ?? '',
        pm?.model_name ?? '',
        pm?.color ?? '',
      ].join(' ').toLowerCase()
      return words.every(w => text.includes(w))
    })
  }

  return results
}

// Create a sell group and assign items in one action
export async function createSellGroupWithItems(
  sg: SellGroupInsert,
  itemIds: string[],
) {
  const { data, error } = await supabase
    .from('sell_groups')
    .insert(sg)
    .select()
    .single()

  if (error) throw error

  const sellGroup = data as SellGroup

  if (itemIds.length > 0) {
    const { error: assignError } = await supabase
      .from('sell_group_items')
      .insert(itemIds.map(itemId => ({ sell_group_id: sellGroup.id, item_id: itemId })))

    if (assignError) throw assignError
  }

  return sellGroup
}

// Bulk assign multiple items to a sell group
export async function bulkAssignItems(sellGroupId: string, itemIds: string[]) {
  if (itemIds.length === 0) return

  const { error } = await supabase
    .from('sell_group_items')
    .insert(itemIds.map(itemId => ({ sell_group_id: sellGroupId, item_id: itemId })))

  if (error) throw error
}

// Toggle live selling flag on a sell group
export async function toggleSellGroupLiveSelling(sellGroupId: string, value: boolean) {
  const { error } = await supabase
    .from('sell_groups')
    .update({ is_live_selling: value })
    .eq('id', sellGroupId)

  if (error) throw error
}

// Fetch sell groups with full product info for the Items page Group Codes tab
interface SellGroupListFilters {
  search?: string
  grade?: string
  isLiveSelling?: boolean
}

export async function getSellGroupsForList(filters: SellGroupListFilters = {}) {
  let query = supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(
        id, brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size, os_family,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      ),
      sell_group_items(count)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.ilike('sell_group_code', `%${filters.search}%`)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }
  if (filters.isLiveSelling !== undefined) {
    query = query.eq('is_live_selling', filters.isLiveSelling)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export type SellGroupListItem = Awaited<ReturnType<typeof getSellGroupsForList>>[number]

// Count sell groups (optionally by status)
export async function getSellGroupStatusCounts(filters: { search?: string; grade?: string } = {}) {
  // Total count
  let totalQuery = supabase
    .from('sell_groups')
    .select('id', { count: 'exact', head: true })
  if (filters.search) totalQuery = totalQuery.ilike('sell_group_code', `%${filters.search}%`)
  if (filters.grade) totalQuery = totalQuery.eq('condition_grade', filters.grade)

  // Available (active) count
  let availableQuery = supabase
    .from('sell_groups')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
  if (filters.search) availableQuery = availableQuery.ilike('sell_group_code', `%${filters.search}%`)
  if (filters.grade) availableQuery = availableQuery.eq('condition_grade', filters.grade)

  const [totalResult, availableResult] = await Promise.all([totalQuery, availableQuery])

  if (totalResult.error) throw totalResult.error
  if (availableResult.error) throw availableResult.error

  return {
    all: totalResult.count ?? 0,
    available: availableResult.count ?? 0,
  }
}

// Fetch sell groups marked for live selling with product info
export async function getLiveSellingSellGroups() {
  const { data, error } = await supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(
        id, brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size, os_family,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      ),
      sell_group_items(count)
    `)
    .eq('is_live_selling', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export type LiveSellingSellGroup = Awaited<ReturnType<typeof getLiveSellingSellGroups>>[number]

// Count of sell groups with is_live_selling = true
export async function getSellGroupLiveSellingCount() {
  const { count, error } = await supabase
    .from('sell_groups')
    .select('id', { count: 'exact', head: true })
    .eq('is_live_selling', true)

  if (error) throw error
  return count ?? 0
}
