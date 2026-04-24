import { supabase } from '@/lib/supabase'

export interface ShopFilters {
  search?: string
  brand?: string
  grade?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'price_asc' | 'price_desc' | 'newest'
  hideNoPrice?: boolean
}

// ---------- Unified shop listing type ----------

export interface ShopListing {
  type: 'item' | 'sell_group' | 'accessory'
  id: string
  code: string          // P000123, G000456, A000789
  title: string         // brand + model or accessory name
  description: string   // short_description or condition notes
  price: number | null
  image_url: string | null
  grade: string | null
  stock: number
  brand: string | null
}

// ---------- Individual items (P-codes) ----------

export async function getShopItems(filters: ShopFilters = {}) {
  // Exclude items that belong to an active sell group (they appear via the group listing)
  const { data: activeSGs } = await supabase
    .from('sell_groups')
    .select('id')
    .eq('active', true)

  const activeSGIds = (activeSGs ?? []).map(sg => sg.id)

  let excludeIds: string[] = []
  if (activeSGIds.length > 0) {
    const { data: sgItemRows } = await supabase
      .from('sell_group_items')
      .select('item_id')
      .in('sell_group_id', activeSGIds)

    excludeIds = (sgItemRows ?? []).map(r => r.item_id)
  }

  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, selling_price, specs_notes, condition_notes,
      product_models!inner(id, brand, model_name, color, short_description, category_id,
        categories(id, name),
        product_media(id, file_url, role, sort_order)
      ),
      item_media(id, file_url, sort_order, visible, thumbnail_url)
    `)
    .eq('item_status', 'AVAILABLE')
    .neq('condition_grade', 'J')

  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  if (filters.hideNoPrice) {
    query = query.not('selling_price', 'is', null)
  }

  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  if (filters.category) {
    query = query.eq('product_models.category_id', filters.category)
  }

  if (filters.sort === 'price_asc') {
    query = query.order('selling_price', { ascending: true, nullsFirst: false })
  } else if (filters.sort === 'price_desc') {
    query = query.order('selling_price', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) throw error

  let results = data ?? []

  // Client-side filtering for search and brand
  const searchTerm = filters.search?.toLowerCase()
  results = results.filter((item) => {
    if (searchTerm) {
      const pm = item.product_models as { brand: string; model_name: string } | null
      const name = pm ? `${pm.brand} ${pm.model_name}`.toLowerCase() : ''
      if (!name.includes(searchTerm) && !item.item_code.toLowerCase().includes(searchTerm)) {
        return false
      }
    }
    if (filters.brand) {
      const pm = item.product_models as { brand: string } | null
      if (pm?.brand !== filters.brand) return false
    }
    if (filters.minPrice !== undefined && Number(item.selling_price) < filters.minPrice) return false
    if (filters.maxPrice !== undefined && Number(item.selling_price) > filters.maxPrice) return false
    return true
  })

  return results
}

// ---------- Sell groups (G-codes) ----------

export async function getShopSellGroups(filters: ShopFilters = {}) {
  let query = supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(id, brand, model_name, color, screen_size, chipset, ports,
        cpu, ram_gb, storage_gb, os_family, short_description,
        product_media(id, file_url, role, sort_order)
      ),
      sell_group_items(count)
    `)
    .eq('active', true)

  if (filters.hideNoPrice) {
    query = query.not('base_price', 'is', null)
  }

  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  if (filters.sort === 'price_asc') {
    query = query.order('base_price', { ascending: true })
  } else if (filters.sort === 'price_desc') {
    query = query.order('base_price', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) throw error

  let results = data ?? []

  const searchTerm = filters.search?.toLowerCase()
  results = results.filter((sg) => {
    if (searchTerm) {
      const pm = sg.product_models as { brand: string; model_name: string } | null
      const name = pm ? `${pm.brand} ${pm.model_name}`.toLowerCase() : ''
      if (!name.includes(searchTerm) && !sg.sell_group_code.toLowerCase().includes(searchTerm)) {
        return false
      }
    }
    if (filters.brand) {
      const pm = sg.product_models as { brand: string } | null
      if (pm?.brand !== filters.brand) return false
    }
    if (filters.minPrice !== undefined && Number(sg.base_price) < filters.minPrice) return false
    if (filters.maxPrice !== undefined && Number(sg.base_price) > filters.maxPrice) return false
    return true
  })

  return results
}

// Keep old name as alias for backward compat
export const getShopProducts = getShopSellGroups

// Get a sell group by its G-code (for live-selling links)
export async function getSellGroupByCode(code: string) {
  const { data, error } = await supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(*, product_media(id, file_url, media_type, role, sort_order)),
      sell_group_items(count)
    `)
    .eq('sell_group_code', code)
    .eq('active', true)
    .single()

  if (error) throw error
  return data
}

// Get a product detail view — all active sell groups for a given product model (different grades/prices)
export async function getProductDetail(productModelId: string) {
  const { data, error } = await supabase
    .from('sell_groups')
    .select(`
      *,
      product_models(*, categories(name, form_fields), product_media(id, file_url, media_type, role, sort_order)),
      sell_group_items(count)
    `)
    .eq('product_id', productModelId)
    .eq('active', true)
    .order('base_price', { ascending: true })

  if (error) throw error
  return data ?? []
}

// ---------- Item detail (single P-code) ----------

export async function getShopItemDetail(itemId: string) {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      product_models(*, categories(name, form_fields, description_fields),
        product_media(id, file_url, media_type, role, sort_order)
      ),
      item_media(id, file_url, sort_order, visible, thumbnail_url, media_type, description)
    `)
    .eq('id', itemId)
    .eq('item_status', 'AVAILABLE')
    .single()

  if (error) throw error
  return data
}

// Check global shop enabled toggle
export async function getShopEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'shop_enabled')
    .single()

  if (error) return true // Default to enabled
  return data.value !== 'false'
}

// Check if items without a selling price should be hidden
export async function getShopHideNoPrice(): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'shop_hide_no_price')
    .single()

  if (error) return true // Default to hiding
  return data.value !== 'false'
}

// Get unique brands from available items + active sell groups
export async function getShopBrands() {
  const [{ data: itemData }, { data: sgData }] = await Promise.all([
    supabase
      .from('items')
      .select('product_models(brand)')
      .eq('item_status', 'AVAILABLE')
      .neq('condition_grade', 'J'),
    supabase
      .from('sell_groups')
      .select('product_models(brand)')
      .eq('active', true),
  ])

  const brands = new Set<string>()
  for (const row of [...(itemData ?? []), ...(sgData ?? [])]) {
    const pm = row.product_models as { brand: string } | null
    if (pm?.brand) brands.add(pm.brand)
  }

  return Array.from(brands).sort()
}

// Get categories that have available items
export async function getShopCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')

  if (error) throw error
  return data ?? []
}
