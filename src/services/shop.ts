import { supabase } from '@/lib/supabase'

interface ShopFilters {
  search?: string
  brand?: string
  grade?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'price_asc' | 'price_desc' | 'newest'
}

// Get all active sell groups for the public shop, with stock counts
export async function getShopProducts(filters: ShopFilters = {}) {
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

  // Client-side filtering (single pass for search, brand, price)
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

// Get unique brands from active sell groups (for filter dropdown)
export async function getShopBrands() {
  const { data, error } = await supabase
    .from('sell_groups')
    .select('product_models(brand)')
    .eq('active', true)

  if (error) throw error

  const brands = new Set<string>()
  for (const sg of data ?? []) {
    const pm = sg.product_models as { brand: string } | null
    if (pm?.brand) brands.add(pm.brand)
  }

  return Array.from(brands).sort()
}
