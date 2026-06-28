import { supabase } from '@/lib/supabase'
import { normalizeStorageGb } from '@/lib/utils'
import type { ProductModel, ProductModelInsert, ProductModelUpdate, ProductModelWithHeroImage } from '@/lib/types'

export interface ProductModelFilters {
  search?: string
  categoryId?: string
}

// Inputs from a parsed supplier listing (NormalizedSupplierProduct) used to resolve the exact
// ACTIVE product_model. `modelText` is the raw model string (may embed an A-number + part-number,
// e.g. "iPhone16 Pro Max A3295 (MYWJ3J/A) 256GB ...").
export interface ProductModelMatchInput {
  brand?: string | null
  modelText?: string | null
  modelNumber?: string | null // carrier/region code for Android (SO-52C, SC-54D, ...)
  storageGb?: number | null
  color?: string | null
  colorJa?: string | null
}

// Extract an Apple part-number like "MYWJ3J/A" from the model text. These are the canonical,
// SKU-precise identifier stored on product_models.part_number.
function extractPartNumber(modelText: string): string | null {
  const m = modelText.match(/\b([A-Z0-9]{4,7}\/[A-Z]{1,2})\b/)
  return m ? m[1] : null
}

// Derive a clean `model_name`-style search term from the raw supplier model text:
//   "iPhone16 Pro Max A3295 (MYWJ3J/A) 256GB ..." -> "iPhone 16 Pro Max"
// Strips everything from the A-number (or the storage token) onward, then space-normalizes the
// glued "iPhone16" -> "iPhone 16" form to match our clean product_models.model_name.
export function cleanModelName(modelText: string): string {
  let name = modelText.trim()
  // Cut at the first A-number (e.g. " A3295 ...") if present...
  const aSplit = name.split(/\s+A\d{4,5}/)[0]
  if (aSplit !== name) {
    name = aSplit
  } else {
    // ...otherwise cut at the storage token (e.g. " 256GB").
    name = name.split(/\s+\d+\s*(?:GB|TB)/i)[0]
  }
  // Normalize "iPhone16" -> "iPhone 16" (catalog stores the spaced form).
  name = name.replace(/\b(iPhone|iPad)(\d)/i, '$1 $2')
  return name.trim()
}

/**
 * Resolve the exact ACTIVE product_model for a parsed supplier listing.
 *
 * Two-stage match (no client-side scan over the >1000-row table — both stages query the server):
 *   (a) part-number exact: the listing's part-number == product_models.part_number (SKU-precise).
 *   (b) fallback: clean the model name and query that single model's SKUs (~30 rows, cap-safe),
 *       then pick the row whose storage + color match the listing (storage-only fallback).
 *
 * Returns the full ProductModelWithHeroImage-shaped row (so the caller can merge it into the
 * picker's product list for off-list display), or null when nothing matches.
 */
export async function findMatchingProductModel(
  input: ProductModelMatchInput,
): Promise<ProductModelWithHeroImage | null> {
  const modelText = (input.modelText ?? '').trim()
  if (!modelText) return null

  const select = '*, product_media(id, file_url, role, sort_order), categories(name)'

  const toHero = (pm: Record<string, unknown>): ProductModelWithHeroImage => {
    const media =
      (pm.product_media as Array<{ id: string; file_url: string; role: string; sort_order: number }>) ?? []
    const hero = media.find((m) => m.role === 'hero') ?? media[0] ?? null
    return {
      ...(pm as object),
      product_media: undefined,
      hero_image_url: hero?.file_url ?? null,
      media_count: media.length,
      categories: pm.categories as { name: string } | null,
    } as ProductModelWithHeroImage
  }

  // (a) Exact part-number match — the happy path.
  const partNo = extractPartNumber(modelText)
  if (partNo) {
    const { data, error } = await supabase
      .from('product_models')
      .select(select)
      .eq('part_number', partNo)
      .eq('status', 'ACTIVE')
      .limit(1)
    if (error) throw error
    if (data && data.length > 0) return toHero(data[0])
  }

  // (a2) Android model_number exact match (SO-52C, SC-54D, ...). Disambiguate by color/storage.
  const modelNo = (input.modelNumber ?? "").trim()
  if (modelNo) {
    const { data, error } = await supabase
      .from('product_models')
      .select(select)
      .eq('model_number', modelNo)
      .eq('status', 'ACTIVE')
    if (error) throw error
    const rows = data ?? []
    if (rows.length > 0) {
      const wantStorage = normalizeStorageGb(input.storageGb)
      const wantColorEn = (input.color ?? '').trim().toLowerCase()
      const wantColorJa = (input.colorJa ?? '').trim()
      const storageMatches = wantStorage == null
        ? rows
        : rows.filter((r) => normalizeStorageGb((r as { storage_gb: unknown }).storage_gb) === wantStorage)
      const pool = storageMatches.length > 0 ? storageMatches : rows
      const byColor = pool.find((r) => {
        const en = ((r as { color: string | null }).color ?? '').trim().toLowerCase()
        const ja = ((r as { color_ja: string | null }).color_ja ?? '').trim()
        return (wantColorEn && en === wantColorEn) || (wantColorJa && ja === wantColorJa)
      })
      const chosen = byColor ?? pool[0]
      if (chosen) return toHero(chosen as Record<string, unknown>)
    }
  }

  // (b) Fallback: query just this model's SKUs, then disambiguate by storage + color in JS.
  const cleanName = cleanModelName(modelText)
  if (!cleanName) return null

  const { data, error } = await supabase
    .from('product_models')
    .select(select)
    .ilike('model_name', cleanName)
    .eq('status', 'ACTIVE')
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return null

  const wantStorage = normalizeStorageGb(input.storageGb)
  const wantColor = (input.color ?? '').trim().toLowerCase()

  const storageMatches = wantStorage == null
    ? rows
    : rows.filter((r) => normalizeStorageGb((r as { storage_gb: unknown }).storage_gb) === wantStorage)

  // Prefer an exact storage + color hit; fall back to storage-only.
  const wantColorJa = (input.colorJa ?? '').trim()
  const exact = (wantColor || wantColorJa)
    ? storageMatches.find((r) => {
        const en = ((r as { color: string | null }).color ?? '').trim().toLowerCase()
        const ja = ((r as { color_ja: string | null }).color_ja ?? '').trim()
        return (wantColor && en === wantColor) || (wantColorJa && ja === wantColorJa)
      })
    : undefined
  const chosen = exact ?? storageMatches[0] ?? null
  return chosen ? toHero(chosen as Record<string, unknown>) : null
}

export async function getProductModels(filters: ProductModelFilters = {}) {
  let query = supabase
    .from('product_models')
    .select('*, product_media(id, media_type), categories(name, form_fields, description_fields)')
    .order('brand')
    .order('model_name')

  if (filters.search) {
    const s = filters.search
    query = query.or(`brand.ilike.%${s}%,model_name.ilike.%${s}%,color.ilike.%${s}%,short_description.ilike.%${s}%`)
  }

  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((pm) => {
    const media = (pm.product_media as unknown as Array<{ id: string; media_type: string }>) ?? []
    const photoCount = media.filter((m) => m.media_type === 'image').length
    const videoCount = media.filter((m) => m.media_type === 'video').length
    return {
      ...pm,
      media_count: media.length,
      photo_count: photoCount,
      video_count: videoCount,
    }
  })
}

export interface ProductColorGroupSku {
  storage_gb: string | null
  part_number: string | null
}

export interface ProductColorGroup {
  representative_id: string
  color_key: string
  brand: string
  model_name: string
  color: string
  model_number: string | null
  category_id: string | null
  category_name: string | null
  short_description: string | null
  storages: string[] | null
  // One entry per storage SKU, ordered by storage size. part# is unique per storage;
  // model_number is shared across the group (shown once at the header line).
  skus: ProductColorGroupSku[]
  sku_count: number
  photo_count: number
  video_count: number
}

export interface ProductColorGroupFilters {
  search?: string
  categoryId?: string
  media?: 'no-photo' | 'no-video'
}

// One row per (brand, model_name, color). Backed by the list_product_color_groups
// RPC (server-side grouping + filtering; also avoids the 1000-row PostgREST cap).
export async function getProductColorGroups(
  filters: ProductColorGroupFilters = {},
): Promise<ProductColorGroup[]> {
  const { data, error } = await supabase.rpc('list_product_color_groups', {
    p_search: filters.search ?? undefined,
    p_category_id: filters.categoryId ?? undefined,
    p_media: filters.media ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as ProductColorGroup[]
}

export async function getProductModelsWithHeroImage(search?: string, categoryId?: string): Promise<ProductModelWithHeroImage[]> {
  let query = supabase
    .from('product_models')
    .select('*, product_media(id, file_url, role, sort_order), categories(name)')
    .order('brand')
    .order('model_name')

  if (search) {
    query = query.or(
      `brand.ilike.%${search}%,model_name.ilike.%${search}%,color.ilike.%${search}%,short_description.ilike.%${search}%`
    )
  }

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((pm) => {
    const media = pm.product_media as unknown as Array<{
      id: string
      file_url: string
      role: string
      sort_order: number
    }> ?? []

    const hero = media.find((m) => m.role === 'hero') ?? media[0] ?? null

    return {
      ...pm,
      product_media: undefined,
      hero_image_url: hero?.file_url ?? null,
      media_count: media.length,
      categories: pm.categories as { name: string } | null,
    } as ProductModelWithHeroImage
  })
}

// Server-side fuzzy search over product_models via the search_product_models RPC. Returns
// INDIVIDUAL rows shaped as ProductModelWithHeroImage (the picker renders these directly),
// bypassing the 1000-row PostgREST cap and tolerating glued/hyphen/JP-color query forms.
export async function searchProductModels(
  query: string,
  categoryId?: string,
  limit = 50,
): Promise<ProductModelWithHeroImage[]> {
  const { data, error } = await supabase.rpc('search_product_models', {
    p_search: query,
    p_category_id: categoryId ?? undefined,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...(r as object),
    hero_image_url: (r as { hero_image_url: string | null }).hero_image_url ?? null,
    media_count: Number((r as { media_count: number }).media_count ?? 0),
    categories: (r as { category_name: string | null }).category_name
      ? { name: (r as { category_name: string }).category_name }
      : null,
  })) as ProductModelWithHeroImage[]
}

export async function batchMatchProducts(
  descriptions: string[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()

  const promises = descriptions.map(async (desc) => {
    try {
      const { data, error } = await supabase.rpc('match_product_model', {
        p_description: desc,
      })
      if (error) {
        results.set(desc, null)
      } else {
        results.set(desc, data as string | null)
      }
    } catch {
      results.set(desc, null)
    }
  })

  await Promise.all(promises)
  return results
}

export async function getProductModel(id: string) {
  const { data, error } = await supabase
    .from('product_models')
    .select('*, product_media(id, file_url, media_type, role, sort_order), categories(name, form_fields, description_fields)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createProductModel(model: ProductModelInsert) {
  const { data, error } = await supabase
    .from('product_models')
    .insert(model)
    .select()
    .single()

  if (error) throw error
  return data as ProductModel
}

export async function updateProductModel(id: string, updates: ProductModelUpdate) {
  const { data, error } = await supabase
    .from('product_models')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ProductModel
}

// Absolute (catalog) specs parsed from a supplier listing's spec table. Only the fields that
// belong canonically on product_models. ram/storage are stored as text on product_models.
export interface ParsedModelSpecs {
  cpu?: string | null
  chipset?: string | null
  ramGb?: number | null
  storageGb?: number | null
  screenSize?: number | null
  camera?: string | null
  ports?: string | null
  osFamily?: string | null
  year?: number | null
}

// Fill ONLY the NULL/empty absolute-spec fields of a product model from parsed specs. Never
// overwrites a value the model already has. Returns the number of fields written (0 = nothing to do).
// Caller gates this to CONFIDENT matches (Apple part# exact / Android model_number exact).
export async function enrichProductModelSpecs(
  modelId: string,
  current: Pick<ProductModel, 'cpu' | 'chipset' | 'ram_gb' | 'storage_gb' | 'screen_size' | 'camera' | 'ports' | 'os_family' | 'year'>,
  parsed: ParsedModelSpecs,
): Promise<number> {
  const updates: ProductModelUpdate = {}
  const isEmpty = (v: unknown) => v == null || v === ''
  if (isEmpty(current.cpu) && parsed.cpu) updates.cpu = parsed.cpu
  if (isEmpty(current.chipset) && parsed.chipset) updates.chipset = parsed.chipset
  if (isEmpty(current.ram_gb) && parsed.ramGb != null) updates.ram_gb = String(parsed.ramGb)
  if (isEmpty(current.storage_gb) && parsed.storageGb != null) updates.storage_gb = String(parsed.storageGb)
  if (isEmpty(current.screen_size) && parsed.screenSize != null) updates.screen_size = parsed.screenSize
  if (isEmpty(current.camera) && parsed.camera) updates.camera = parsed.camera
  if (isEmpty(current.ports) && parsed.ports) updates.ports = parsed.ports
  if (isEmpty(current.os_family) && parsed.osFamily) updates.os_family = parsed.osFamily
  if (isEmpty(current.year) && parsed.year != null) updates.year = parsed.year

  const keys = Object.keys(updates)
  if (keys.length === 0) return 0

  const { error } = await supabase.from('product_models').update(updates).eq('id', modelId)
  if (error) throw error
  return keys.length
}

export async function deleteProductModel(id: string) {
  const { error } = await supabase
    .from('product_models')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function addProductMedia(
  productId: string,
  fileUrl: string,
  role: 'hero' | 'gallery' = 'gallery',
  mediaType: 'image' | 'video' = 'image',
) {
  const { data: existing } = await supabase
    .from('product_media')
    .select('sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('product_media')
    .insert({
      product_id: productId,
      file_url: fileUrl,
      media_type: mediaType,
      role,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProductMedia(mediaId: string) {
  const { error } = await supabase
    .from('product_media')
    .delete()
    .eq('id', mediaId)

  if (error) throw error
}

export async function reorderProductMedia(items: { id: string; sort_order: number }[]) {
  const promises = items.map(({ id, sort_order }) =>
    supabase.from('product_media').update({ sort_order }).eq('id', id)
  )
  const results = await Promise.all(promises)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
