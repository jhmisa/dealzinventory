import { supabase } from '@/lib/supabase'
import type {
  Accessory,
  AccessoryInsert,
  AccessoryUpdate,
  AccessoryMedia,
  AccessoryStockEntry,
  AccessoryStockAdjustment,
  AccessoryAdjustmentReason,
} from '@/lib/types'

// --- Code Generation ---

export async function generateAccessoryCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'A',
    seq_name: 'a_code_seq',
  })
  if (error) throw error
  return data as string
}

// --- CRUD ---

interface AccessoryFilters {
  search?: string
  categoryId?: string
  active?: boolean
  shopVisible?: boolean
}

export async function getAccessories(filters: AccessoryFilters = {}) {
  let query = supabase
    .from('accessories')
    .select(`
      *,
      categories(name),
      accessory_media(id, file_url, media_type, sort_order)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `accessory_code.ilike.%${filters.search}%,name.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`
    )
  }
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }
  if (filters.active !== undefined) {
    query = query.eq('active', filters.active)
  }
  if (filters.shopVisible !== undefined) {
    query = query.eq('shop_visible', filters.shopVisible)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as (Accessory & { categories: { name: string } | null; accessory_media: AccessoryMedia[] })[]
}

export async function getAccessory(id: string) {
  const { data, error } = await supabase
    .from('accessories')
    .select(`
      *,
      categories(name),
      accessory_media(id, file_url, media_type, sort_order)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Accessory & { categories: { name: string } | null; accessory_media: AccessoryMedia[] }
}

export async function getAccessoryByCode(code: string) {
  const { data, error } = await supabase
    .from('accessories')
    .select(`
      *,
      categories(name),
      accessory_media(id, file_url, media_type, sort_order)
    `)
    .eq('accessory_code', code)
    .single()

  if (error) throw error
  return data as Accessory & { categories: { name: string } | null; accessory_media: AccessoryMedia[] }
}

export async function createAccessory(data: Omit<AccessoryInsert, 'accessory_code'>) {
  const code = await generateAccessoryCode()
  const { data: accessory, error } = await supabase
    .from('accessories')
    .insert({ ...data, accessory_code: code })
    .select()
    .single()

  if (error) throw error
  return accessory as Accessory
}

export async function updateAccessory(id: string, updates: AccessoryUpdate) {
  const { data, error } = await supabase
    .from('accessories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Accessory
}

export async function deactivateAccessory(id: string) {
  return updateAccessory(id, { active: false })
}

// --- Media ---

export async function uploadAccessoryMedia(accessoryId: string, file: File) {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const filePath = `${accessoryId}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('accessory-media')
    .upload(filePath, file, { contentType: file.type, upsert: false })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('accessory-media')
    .getPublicUrl(filePath)

  // Get current max sort_order
  const { data: existing } = await supabase
    .from('accessory_media')
    .select('sort_order')
    .eq('accessory_id', accessoryId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSort = ((existing?.[0]?.sort_order ?? -1) as number) + 1

  const { data: media, error: insertError } = await supabase
    .from('accessory_media')
    .insert({
      accessory_id: accessoryId,
      file_url: urlData.publicUrl,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      sort_order: nextSort,
    })
    .select()
    .single()

  if (insertError) throw insertError
  return media as AccessoryMedia
}

export async function deleteAccessoryMedia(mediaId: string) {
  const { error } = await supabase
    .from('accessory_media')
    .delete()
    .eq('id', mediaId)

  if (error) throw error
}

// --- Stock Management ---

export async function addStockEntry(entry: {
  accessory_id: string
  supplier_id?: string | null
  quantity: number
  unit_cost: number
  notes?: string | null
}) {
  const totalCost = entry.quantity * entry.unit_cost

  const { data, error } = await supabase
    .from('accessory_stock_entries')
    .insert({
      accessory_id: entry.accessory_id,
      supplier_id: entry.supplier_id ?? null,
      quantity: entry.quantity,
      unit_cost: entry.unit_cost,
      total_cost: totalCost,
      notes: entry.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error

  // Increment stock
  const { data: newQty, error: rpcError } = await supabase.rpc('increment_accessory_stock', {
    p_accessory_id: entry.accessory_id,
    p_quantity: entry.quantity,
  })

  if (rpcError) throw rpcError
  return { entry: data as AccessoryStockEntry, newQuantity: newQty as number }
}

export async function addStockAdjustment(adjustment: {
  accessory_id: string
  quantity: number
  reason: AccessoryAdjustmentReason
  supplier_id?: string | null
  notes?: string | null
}) {
  const { data, error } = await supabase
    .from('accessory_stock_adjustments')
    .insert({
      accessory_id: adjustment.accessory_id,
      quantity: adjustment.quantity,
      reason: adjustment.reason,
      supplier_id: adjustment.supplier_id ?? null,
      notes: adjustment.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error

  // Decrement stock
  const { data: newQty, error: rpcError } = await supabase.rpc('decrement_accessory_stock', {
    p_accessory_id: adjustment.accessory_id,
    p_quantity: adjustment.quantity,
  })

  if (rpcError) throw rpcError
  if (newQty === null) throw new Error('Insufficient stock for adjustment')

  return { adjustment: data as AccessoryStockAdjustment, newQuantity: newQty as number }
}

export async function getStockHistory(accessoryId: string) {
  const [entriesResult, adjustmentsResult, ordersResult] = await Promise.all([
    supabase
      .from('accessory_stock_entries')
      .select('*, suppliers(supplier_name)')
      .eq('accessory_id', accessoryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('accessory_stock_adjustments')
      .select('*, suppliers(supplier_name)')
      .eq('accessory_id', accessoryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_items')
      .select('*, orders(id, order_code, customers(customer_code, last_name))')
      .eq('accessory_id', accessoryId)
      .order('created_at', { ascending: false }),
  ])

  if (entriesResult.error) throw entriesResult.error
  if (adjustmentsResult.error) throw adjustmentsResult.error
  if (ordersResult.error) throw ordersResult.error

  type OrderItemWithOrder = {
    id: string
    quantity: number
    created_at: string
    orders: { id: string; order_code: string; customers: { customer_code: string; last_name: string } | null } | null
  }

  type StockHistoryItem =
    | { type: 'entry'; data: AccessoryStockEntry & { suppliers: { supplier_name: string } | null }; date: string }
    | { type: 'adjustment'; data: AccessoryStockAdjustment & { suppliers: { supplier_name: string } | null }; date: string }
    | { type: 'order'; data: OrderItemWithOrder; date: string }

  const entries: StockHistoryItem[] = (entriesResult.data ?? []).map((e) => ({
    type: 'entry' as const,
    data: e as AccessoryStockEntry & { suppliers: { supplier_name: string } | null },
    date: e.created_at,
  }))

  const adjustments: StockHistoryItem[] = (adjustmentsResult.data ?? []).map((a) => ({
    type: 'adjustment' as const,
    data: a as AccessoryStockAdjustment & { suppliers: { supplier_name: string } | null },
    date: a.created_at,
  }))

  const orders: StockHistoryItem[] = (ordersResult.data ?? []).map((o) => ({
    type: 'order' as const,
    data: o as OrderItemWithOrder,
    date: o.created_at,
  }))

  return [...entries, ...adjustments, ...orders].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

// --- Search for matching (intake flow) ---

export async function searchAccessoriesForMatch(query: string) {
  const { data, error } = await supabase
    .from('accessories')
    .select('id, accessory_code, name, brand, selling_price, stock_quantity')
    .eq('active', true)
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%,accessory_code.ilike.%${query}%`)
    .order('name')
    .limit(20)

  if (error) throw error
  return data ?? []
}

// --- Shop ---

export async function getShopAccessories(filters: { search?: string; categoryId?: string; sort?: string } = {}) {
  let query = supabase
    .from('accessories')
    .select(`
      *,
      categories(name),
      accessory_media(id, file_url, media_type, sort_order)
    `)
    .eq('shop_visible', true)
    .eq('active', true)
    .gt('stock_quantity', 0)

  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`
    )
  }
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }

  if (filters.sort === 'price_asc') {
    query = query.order('selling_price', { ascending: true })
  } else if (filters.sort === 'price_desc') {
    query = query.order('selling_price', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as (Accessory & { categories: { name: string } | null; accessory_media: AccessoryMedia[] })[]
}

// --- Available accessories for orders ---

export async function getAvailableAccessories(search: string) {
  const { data, error } = await supabase
    .from('accessories')
    .select('id, accessory_code, name, brand, selling_price, stock_quantity')
    .eq('active', true)
    .gt('stock_quantity', 0)
    .or(`accessory_code.ilike.%${search}%,name.ilike.%${search}%,brand.ilike.%${search}%`)
    .order('name')
    .limit(20)

  if (error) throw error
  return data ?? []
}
