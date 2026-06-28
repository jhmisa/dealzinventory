import { supabase } from '@/lib/supabase'
import { normalizeStorageGb } from '@/lib/utils'
import type { BackorderLine, BackorderLineInsert, BackorderLineUpdate } from '@/lib/types'
import type { Database } from '@/lib/database.types'

type BackorderLineStatus = Database['public']['Enums']['backorder_line_status']
type ConditionGrade = Database['public']['Enums']['condition_grade']

interface BackorderLineFilters {
  status?: string
  search?: string
}

// ---------------------------------------------------------------------------
// Backorder lines (B-codes)
// ---------------------------------------------------------------------------

// List backorder lines joined to product_models (+ supplier name). Mirrors the
// sell-groups list shape so the front end can render a spec line per row.
export async function listBackorderLines(filters: BackorderLineFilters = {}) {
  let query = supabase
    .from('backorder_lines')
    .select(`
      *,
      product_models(*, categories(name, description_fields), product_media(file_url, role, sort_order)),
      suppliers(id, supplier_name)
    `)
    .order('created_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status as BackorderLineStatus)
  }
  if (filters.search) {
    query = query.ilike('backorder_code', `%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export type BackorderLineListItem = Awaited<ReturnType<typeof listBackorderLines>>[number]

// Single backorder line with joins + its photos.
export async function getBackorderLine(id: string) {
  const { data, error } = await supabase
    .from('backorder_lines')
    .select(`
      *,
      product_models(*, categories(name, description_fields), product_media(id, file_url, media_type, role, sort_order)),
      suppliers(id, supplier_name),
      backorder_line_media(id, file_url, source, sort_order)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function generateBackorderCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'B',
    seq_name: 'b_code_seq',
  })

  if (error) throw error
  return data as string
}

// Create a backorder line with an auto-generated B-code.
export async function createBackorderLine(
  input: Omit<BackorderLineInsert, 'backorder_code'>,
): Promise<BackorderLine> {
  const backorder_code = await generateBackorderCode()

  const { data, error } = await supabase
    .from('backorder_lines')
    .insert({ ...input, backorder_code })
    .select()
    .single()

  if (error) throw error
  return data as BackorderLine
}

export async function updateBackorderLine(
  id: string,
  updates: BackorderLineUpdate,
): Promise<BackorderLine> {
  const { data, error } = await supabase
    .from('backorder_lines')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as BackorderLine
}

// ---------------------------------------------------------------------------
// Supplier product fetch + photo curation (edge functions)
// ---------------------------------------------------------------------------

export async function fetchSupplierProduct(url: string) {
  const { data, error } = await supabase.functions.invoke('fetch-supplier-product', {
    body: { url },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.product ?? null
}

export interface ProductImageSearchResult {
  configured: boolean
  images: string[]
}

export async function searchProductImages(
  query: string,
  limit = 8,
): Promise<ProductImageSearchResult> {
  const { data, error } = await supabase.functions.invoke('search-product-images', {
    body: { query, limit },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return {
    configured: Boolean(data?.configured),
    images: Array.isArray(data?.images) ? (data.images as string[]) : [],
  }
}

export async function saveBackorderPhotos(backorderLineId: string, imageUrls: string[]) {
  const { data, error } = await supabase.functions.invoke('save-backorder-photos', {
    body: { backorder_line_id: backorderLineId, image_urls: imageUrls },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ---------------------------------------------------------------------------
// Backorder line media
// ---------------------------------------------------------------------------

export async function listBackorderMedia(backorderLineId: string) {
  const { data, error } = await supabase
    .from('backorder_line_media')
    .select('id, backorder_line_id, file_url, source, sort_order, created_at')
    .eq('backorder_line_id', backorderLineId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function deleteBackorderMedia(mediaId: string) {
  const { error } = await supabase
    .from('backorder_line_media')
    .delete()
    .eq('id', mediaId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Fulfillment queue
// ---------------------------------------------------------------------------

// Open pre-order order_items (backorder_line_id set, not yet FULFILLED), joined
// to their order + customer + backorder line (+ product spec). Returned flat for
// client-side grouping by backorder line.
export async function listToFulfill() {
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      id, order_id, backorder_line_id, backorder_status, unit_price, quantity, created_at,
      orders(id, order_code, order_status,
        customers(id, customer_code, first_name, last_name)
      ),
      backorder_lines(
        *,
        product_models(*, categories(name, description_fields)),
        suppliers(id, supplier_name)
      )
    `)
    .not('backorder_line_id', 'is', null)
    .neq('backorder_status', 'FULFILLED')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export type ToFulfillRow = Awaited<ReturnType<typeof listToFulfill>>[number]

export async function markBackorderOrdered(orderItemId: string) {
  const { error } = await supabase.rpc('mark_backorder_ordered', {
    p_order_item_id: orderItemId,
  })

  if (error) throw error
}

export async function fulfillBackorderWithItem(orderItemId: string, itemId: string) {
  const { error } = await supabase.rpc('fulfill_backorder_with_item', {
    p_order_item_id: orderItemId,
    p_item_id: itemId,
  })

  if (error) throw error
}

export async function reserveBackorderUnit(
  orderId: string,
  backorderLineId: string,
  unitPrice: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('reserve_backorder_unit', {
    p_order_id: orderId,
    p_backorder_line_id: backorderLineId,
    p_unit_price: unitPrice,
  })

  if (error) throw error
  return data as string
}

// ---------------------------------------------------------------------------
// Eligible P-code lookup (for the fulfillment swap dialog)
// ---------------------------------------------------------------------------

export interface EligibleLineSpec {
  product_id: string
  storage_gb: number | null
  color: string | null
  condition_grade: string
}

// AVAILABLE items matching a backorder line's core spec that are NOT already in
// an order or a sell group. Storage matching happens in JS (items.storage_gb is
// messy free-text, line.storage_gb is integer) via the shared normalizeStorageGb.
export async function findEligiblePCodes(line: EligibleLineSpec) {
  // Candidate items: AVAILABLE + same product + same grade + same color (CI).
  let query = supabase
    .from('items')
    .select(`
      id, item_code, item_status, condition_grade, color, storage_gb, product_id,
      selling_price, discount, ram_gb, cpu, screen_size, battery_health_pct,
      product_models(brand, model_name, cpu, ram_gb, storage_gb, color, categories(name, description_fields)),
      order_items(id),
      sell_group_items(id)
    `)
    .eq('item_status', 'AVAILABLE')
    .eq('product_id', line.product_id)
    .eq('condition_grade', line.condition_grade as ConditionGrade)
    .order('item_code', { ascending: false })

  if (line.color != null && line.color.trim() !== '') {
    query = query.ilike('color', line.color.trim())
  }

  const { data, error } = await query
  if (error) throw error

  const targetStorage = normalizeStorageGb(line.storage_gb)

  return (data ?? []).filter((item) => {
    // Exclude items already committed to an order or a sell group.
    const inOrder = Array.isArray(item.order_items) && item.order_items.length > 0
    const inGroup = Array.isArray(item.sell_group_items) && item.sell_group_items.length > 0
    if (inOrder || inGroup) return false
    // Storage must match after normalization.
    return normalizeStorageGb(item.storage_gb) === targetStorage
  })
}

export type EligiblePCode = Awaited<ReturnType<typeof findEligiblePCodes>>[number]
