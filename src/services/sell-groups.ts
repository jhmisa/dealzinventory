import { supabase } from '@/lib/supabase'
import type { SellGroup, SellGroupInsert, SellGroupUpdate } from '@/lib/types'

interface SellGroupFilters {
  search?: string
  active?: boolean
  productId?: string
  grade?: string
}

// Embedded "representative item" select — used by list/detail queries so the
// front end can render Normal/Discount price + getItemDescription without an
// extra round-trip. Since all members of a group share spec/price under the new
// invariant (D2), the first row of sell_group_items is sufficient.
const REP_ITEM_SELECT = `
  sell_group_items(
    items(
      id, item_code, condition_grade, item_status, selling_price, discount,
      color, ram_gb, storage_gb, cpu, screen_size, battery_health_pct, condition_notes,
      product_models(*, categories(name, description_fields))
    )
  )
`

export async function getSellGroups(filters: SellGroupFilters = {}) {
  let query = supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(*, categories(name, description_fields)),
      ${REP_ITEM_SELECT}
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
      items(id, item_code, condition_grade, item_status, inspected_at, selling_price, discount,
        product_models(brand, model_name, cpu, ram_gb, storage_gb)
      )
    `)
    .eq('sell_group_id', sellGroupId)
    .order('assigned_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Get available items that match a sell group's locked criteria (selling_price, grade, color, ram_gb, storage_gb).
// Used by the Add-Items dialog on the sell group detail page. Items already in any sell group are returned
// with `assigned_sell_group_code` so the caller can grey them out.
export async function getAvailableItems(sellGroupId: string) {
  // First, derive the locked criteria from any existing member of this group.
  const { data: members, error: memberErr } = await supabase
    .from('sell_group_items')
    .select('items(selling_price, condition_grade, color, ram_gb, storage_gb, product_id)')
    .eq('sell_group_id', sellGroupId)
    .limit(1)
  if (memberErr) throw memberErr

  const rep = (members?.[0]?.items as {
    selling_price: number | null
    condition_grade: string | null
    color: string | null
    ram_gb: string | null
    storage_gb: string | null
    product_id: string | null
  } | null) ?? null

  // If the group is empty, fall back to the group's own product_id + condition_grade.
  let productId = rep?.product_id ?? null
  let grade = rep?.condition_grade ?? null
  if (!productId || !grade) {
    const sg = await getSellGroup(sellGroupId)
    productId = sg.product_id
    grade = sg.condition_grade
  }

  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, item_status, inspected_at, selling_price, discount,
      color, ram_gb, storage_gb, product_id,
      product_models(brand, model_name, cpu, ram_gb, storage_gb, color, short_description, categories(name, description_fields)),
      sell_group_items(sell_groups(id, sell_group_code))
    `)
    .eq('item_status', 'AVAILABLE')
    .eq('product_id', productId)
    .eq('condition_grade', grade)
    .order('inspected_at', { ascending: false })

  // If we have a representative item, narrow further to matching uniformity criteria.
  if (rep?.selling_price != null) {
    query = query.eq('selling_price', rep.selling_price)
  }

  const { data, error } = await query
  if (error) throw error

  // Filter out items already in an order (sold/reserved). Grouped items are NOT filtered —
  // they come back with `assigned_sell_group_code` for the caller to render greyed-out.
  const { data: orderedItems } = await supabase.from('order_items').select('item_id')
  const orderedIds = new Set((orderedItems ?? []).map(o => o.item_id))

  return (data ?? [])
    .filter(item => !orderedIds.has(item.id))
    .map(item => {
      const sgi = (item.sell_group_items ?? []) as Array<{ sell_groups: { id: string; sell_group_code: string } | null }>
      const inGroup = sgi[0]?.sell_groups
      return {
        ...item,
        assigned_sell_group_id: inGroup?.id ?? null,
        assigned_sell_group_code: inGroup?.sell_group_code ?? null,
      }
    })
    // Hide items already in this same group (already-assigned, no value showing them)
    .filter(item => item.assigned_sell_group_id !== sellGroupId)
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

// Get all AVAILABLE items for the New Sell Group picker.
// Returns items already in another sell group with `assigned_sell_group_code` populated
// (for greyed-out display) instead of hiding them.
interface UnassignedItemFilters {
  search?: string
  grade?: string
}

export async function getUnassignedAvailableItems(filters: UnassignedItemFilters = {}) {
  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, item_status, selling_price, discount,
      color, ram_gb, storage_gb, cpu, screen_size, battery_health_pct, condition_notes, product_id,
      product_models(id, brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, categories(name, description_fields)),
      sell_group_items(sell_groups(id, sell_group_code))
    `)
    .eq('item_status', 'AVAILABLE')
    .neq('condition_grade', 'J')
    .order('item_code', { ascending: false })

  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error } = await query

  if (error) throw error

  // Filter out items already in an order. Grouped items remain visible (greyed out).
  const { data: orderedItems } = await supabase.from('order_items').select('item_id')
  const orderedIds = new Set((orderedItems ?? []).map(o => o.item_id))

  let results = (data ?? [])
    .filter(item => !orderedIds.has(item.id))
    .map(item => {
      const sgi = (item.sell_group_items ?? []) as Array<{ sell_groups: { id: string; sell_group_code: string } | null }>
      const inGroup = sgi[0]?.sell_groups
      return {
        ...item,
        assigned_sell_group_id: inGroup?.id ?? null,
        assigned_sell_group_code: inGroup?.sell_group_code ?? null,
      }
    })

  // Client-side search across item_code, brand, and model_name
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

export type PickerItem = Awaited<ReturnType<typeof getUnassignedAvailableItems>>[number]

// Create a sell group and assign items in one action.
// product_id and condition_grade are derived from the first item (per the new picker invariant).
// The DB triggers will: (a) enforce uniformity across all selected items, (b) sync items.discount
// to sg.discount_amount.
export async function createSellGroupWithItems(
  sgInput: { sell_group_code: string; discount_amount: number; active: boolean },
  itemIds: string[],
): Promise<SellGroup> {
  if (itemIds.length === 0) {
    throw new Error('Sell group must contain at least one item')
  }

  // Derive product_id + condition_grade from the first selected item.
  const { data: firstItem, error: itemErr } = await supabase
    .from('items')
    .select('product_id, condition_grade')
    .eq('id', itemIds[0])
    .single()
  if (itemErr) throw itemErr
  if (!firstItem?.product_id) throw new Error('Selected item has no product')

  const { data: sg, error: sgErr } = await supabase
    .from('sell_groups')
    .insert({
      sell_group_code: sgInput.sell_group_code,
      discount_amount: sgInput.discount_amount,
      active: sgInput.active,
      product_id: firstItem.product_id,
      condition_grade: firstItem.condition_grade,
    })
    .select()
    .single()
  if (sgErr) throw sgErr

  // Insert the items. DB triggers handle uniformity check + items.discount sync.
  const { error: itemsErr } = await supabase
    .from('sell_group_items')
    .insert(itemIds.map(id => ({ sell_group_id: sg.id, item_id: id })))
  if (itemsErr) {
    // Roll back sell_group on items failure
    await supabase.from('sell_groups').delete().eq('id', sg.id)
    throw itemsErr
  }

  return sg as SellGroup
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
      ${REP_ITEM_SELECT}
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

// Fetch sell groups marked for live selling with product info + item/order/customer details
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
      sell_group_items(
        id, assigned_at,
        items(
          id, item_code, item_status, selling_price, discount,
          order_items(
            orders(id, order_code, order_status,
              customers(id, customer_code, first_name, last_name)
            )
          )
        )
      )
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
