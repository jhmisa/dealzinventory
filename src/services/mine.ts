import { supabase } from '@/lib/supabase'
import { getItemByCode, getItem } from '@/services/items'
import { getSellGroupByCode } from '@/services/sell-groups'
import { getAccessoryByCode } from '@/services/accessories'
import { getBackorderLine } from '@/services/backorders'
import { getSellGroupDescription, getItemDescription, filterHiddenProductMedia } from '@/lib/utils'
import type { GalleryImage } from '@/components/shared/image-gallery'

export interface ClaimableProduct {
  type: 'item' | 'sell_group' | 'accessory' | 'backorder'
  code: string
  id: string
  title: string
  subtitle: string
  grade: string | null
  price: number
  originalPrice?: number
  media: GalleryImage[]
  available: boolean
  stockCount?: number
  conditionNotes?: string | null
  // Backorder only: English included-accessories string, rendered as a separate line under the subtitle.
  accessories?: string | null
  // Backorder (pre-order) only: estimated working-day lead-time range shown on the product page.
  leadTimeMinDays?: number | null
  leadTimeMaxDays?: number | null
  raw: {
    itemId?: string
    accessoryId?: string
    sellGroupId?: string
    backorderLineId?: string
    productId?: string
  }
}

export function parseCode(code: string): { prefix: 'P' | 'G' | 'A' | 'B'; digits: string } | null {
  const match = code.match(/^(P|G|A|B)(\d{6})$/i)
  if (!match) return null
  return { prefix: match[1].toUpperCase() as 'P' | 'G' | 'A' | 'B', digits: match[2] }
}

export async function getClaimableByCode(code: string): Promise<ClaimableProduct | null> {
  const parsed = parseCode(code)
  if (!parsed) return null

  const normalized = `${parsed.prefix}${parsed.digits}`

  switch (parsed.prefix) {
    case 'P':
      return getClaimableItem(normalized)
    case 'G':
      return getClaimableSellGroup(normalized)
    case 'A':
      return getClaimableAccessory(normalized)
    case 'B':
      return getClaimableBackorder(normalized)
    default:
      return null
  }
}

async function getClaimableItem(code: string): Promise<ClaimableProduct | null> {
  try {
    const itemRef = await getItemByCode(code)
    if (!itemRef) return null

    const item = await getItem(itemRef.id)
    if (!item) return null

    const pm = item.product_models as {
      brand: string; model_name: string; color: string | null; short_description: string | null
      cpu: string | null; ram_gb: string | null; storage_gb: string | null; screen_size: number | null; os_family: string | null
      product_media: { id: string; file_url: string; role: string; sort_order: number; media_type: string }[]
    } | null

    const title = pm ? `${pm.brand} ${pm.model_name}` : code
    // Build the description the same way the customer showcase page does — item-level
    // spec fields (with product-model fallback) resolved against the category's
    // description_fields — so the recorder overlay shows the full spec-rich line
    // (storage/RAM/chip/screen/color), not a thin fallback. See feedback_consistent_descriptions.
    const category = (item.product_models as { categories?: { description_fields?: string[] | null } | null } | null)?.categories ?? null
    const subtitle = getItemDescription(
      item as unknown as Record<string, unknown>,
      pm as unknown as Record<string, unknown> | null,
      category?.description_fields ?? null,
    )

    // Fetch photo group media (primary product shots)
    let photoGroupMedia: { id: string; file_url: string; media_type: string; sort_order: number }[] = []
    if (item.photo_group_id) {
      const { data: pgm } = await supabase
        .from('photo_group_media')
        .select('id, file_url, media_type, sort_order')
        .eq('photo_group_id', item.photo_group_id)
        .order('sort_order')
      photoGroupMedia = pgm ?? []
    }

    // Combine media: photo_group_media > item_media > product_media (fallback)
    const media: GalleryImage[] = []
    for (const m of photoGroupMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }
    const itemMedia = (item.item_media ?? []) as { id: string; file_url: string; media_type: string; sort_order: number; visible: boolean }[]
    const visibleItemMedia = itemMedia.filter(m => m.visible !== false).sort((a, b) => a.sort_order - b.sort_order)
    for (const m of visibleItemMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }
    const productMedia = filterHiddenProductMedia(pm?.product_media ?? [], item.hidden_product_photo_ids)
      .sort((a, b) => a.sort_order - b.sort_order)
    for (const m of productMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }

    const available = item.item_status === 'AVAILABLE' && item.condition_grade !== 'J'

    return {
      type: 'item',
      code,
      id: item.id,
      title,
      subtitle,
      grade: item.condition_grade,
      price: (item.selling_price ?? 0) - (Number(item.discount) || 0),
      originalPrice: (Number(item.discount) || 0) > 0 ? (item.selling_price ?? 0) : undefined,
      media,
      available,
      conditionNotes: item.condition_notes,
      raw: { itemId: item.id, productId: item.product_id ?? undefined },
    }
  } catch {
    return null
  }
}

async function getClaimableSellGroup(code: string): Promise<ClaimableProduct | null> {
  try {
    const sg = await getSellGroupByCode(code)
    if (!sg) return null

    const pm = sg.product_models as {
      brand: string; model_name: string; color: string | null; short_description: string | null
      cpu: string | null; ram_gb: string | null; storage_gb: string | null; screen_size: number | null; os_family: string | null
      product_media: { id: string; file_url: string; media_type: string; sort_order: number }[]
    } | null

    const title = pm ? `${pm.brand} ${pm.model_name}` : code
    const subtitle = getSellGroupDescription(sg as Parameters<typeof getSellGroupDescription>[0])

    // Fetch photo group media (primary product shots)
    let photoGroupMedia: { id: string; file_url: string; media_type: string; sort_order: number }[] = []
    if (sg.photo_group_id) {
      const { data: pgm } = await supabase
        .from('photo_group_media')
        .select('id, file_url, media_type, sort_order')
        .eq('photo_group_id', sg.photo_group_id)
        .order('sort_order')
      photoGroupMedia = pgm ?? []
    }

    // Combine media: photo_group_media > product_media (fallback)
    const media: GalleryImage[] = []
    for (const m of photoGroupMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }
    const productMedia = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
    for (const m of productMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }

    // Count available items in the sell group + pick a representative for pricing
    const items = (sg.sell_group_items ?? []) as { items: { id: string; item_status: string; condition_grade: string; selling_price: number | null } | null }[]
    const availableItems = items.filter(sgi => sgi.items?.item_status === 'AVAILABLE' && sgi.items?.condition_grade !== 'J')
    const available = sg.active === true && availableItems.length > 0

    // Under the new model, sell_groups.discount_amount is synced down to each member's items.discount.
    // Pricing is driven by the items' selling_price minus the group's discount_amount.
    const repItem = availableItems[0]?.items ?? items[0]?.items
    const sellingPrice = Number(repItem?.selling_price ?? 0)
    const discount = Number(sg.discount_amount ?? 0)
    const effectivePrice = Math.max(0, sellingPrice - discount)

    return {
      type: 'sell_group',
      code,
      id: sg.id,
      title,
      subtitle,
      grade: sg.condition_grade,
      price: effectivePrice,
      originalPrice: discount > 0 ? sellingPrice : undefined,
      media,
      available,
      stockCount: availableItems.length,
      raw: { sellGroupId: sg.id, productId: sg.product_id ?? undefined },
    }
  } catch {
    return null
  }
}

async function getClaimableAccessory(code: string): Promise<ClaimableProduct | null> {
  try {
    const acc = await getAccessoryByCode(code)
    if (!acc) return null

    const accMedia = (acc.accessory_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
    const media: GalleryImage[] = accMedia.map(m => ({
      id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image',
    }))

    const title = [acc.brand, acc.name].filter(Boolean).join(' ')
    const available = acc.active && acc.stock_quantity > 0

    return {
      type: 'accessory',
      code,
      id: acc.id,
      title,
      subtitle: acc.description ?? '',
      grade: null,
      price: acc.selling_price,
      media,
      available,
      stockCount: acc.stock_quantity,
      raw: { accessoryId: acc.id },
    }
  } catch {
    return null
  }
}

async function getClaimableBackorder(code: string): Promise<ClaimableProduct | null> {
  try {
    // Resolve the B-code -> id, then reuse the joined fetch (product_models + categories +
    // product_media). B-codes inherit their model's gallery as the single photo source.
    const { data: ref } = await supabase
      .from('backorder_lines')
      .select('id')
      .eq('backorder_code', code)
      .maybeSingle()
    if (!ref) return null

    const line = await getBackorderLine(ref.id)
    if (!line) return null

    const pm = line.product_models as {
      brand: string; model_name: string; categories: { description_fields: string[] | null } | null
      product_media: { id: string; file_url: string; media_type: string; role: string; sort_order: number }[]
    } | null

    const title = pm ? `${pm.brand} ${pm.model_name}` : code
    const subtitle = getItemDescription(
      line as unknown as Record<string, unknown>,
      pm as unknown as Record<string, unknown> | null,
      pm?.categories?.description_fields,
    )

    // Media: the product model's catalog gallery (photos + videos), ordered by sort_order.
    // B-codes inherit their model's full gallery — there is no per-line curated layer.
    const media: GalleryImage[] = []
    const productMedia = (pm?.product_media ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
    for (const m of productMedia) {
      media.push({ id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image' })
    }

    const sellingPrice = Number(line.selling_price ?? 0)
    const discount = Number(line.discount_amount ?? 0)
    const effectivePrice = Math.max(0, sellingPrice - discount)
    const available = line.status === 'ACTIVE' && (line.available ?? 0) > 0

    return {
      type: 'backorder',
      code,
      id: line.id,
      title,
      subtitle,
      grade: line.condition_grade,
      price: effectivePrice,
      originalPrice: discount > 0 ? sellingPrice : undefined,
      media,
      available,
      stockCount: line.available ?? 0,
      accessories: (line.included_accessories as string | null)?.trim() || null,
      leadTimeMinDays: line.lead_time_min_days ?? null,
      leadTimeMaxDays: line.lead_time_days ?? null,
      raw: { backorderLineId: line.id, productId: line.product_id ?? undefined },
    }
  } catch {
    return null
  }
}

// --- Check for existing open order ---

export interface ExistingOrder {
  id: string
  order_code: string
  order_status: string
  shipping_address: string | null
  delivery_date: string | null
  delivery_time_code: string | null
  payment_method: string | null
  shipping_cost: number
  item_count: number
}

export async function getExistingOpenOrder(customerId: string): Promise<ExistingOrder | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_code, order_status, shipping_address, delivery_date, delivery_time_code, payment_method, shipping_cost, order_items(id)')
    .eq('customer_id', customerId)
    .in('order_status', ['PENDING', 'CONFIRMED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const items = (data.order_items ?? []) as { id: string }[]
  return {
    id: data.id,
    order_code: data.order_code,
    order_status: data.order_status,
    shipping_address: data.shipping_address,
    delivery_date: data.delivery_date,
    delivery_time_code: data.delivery_time_code,
    payment_method: data.payment_method,
    shipping_cost: data.shipping_cost ?? 1000,
    item_count: items.length,
  }
}

// --- Claim (calls edge function) ---

interface ClaimMineInput {
  code: string
  customerId: string
  shippingAddress: string
  deliveryDate?: string | null
  deliveryTimeCode?: string | null
  paymentMethod?: string
  forceNewOrder?: boolean
}

export async function claimMine(input: ClaimMineInput) {
  const { data, error } = await supabase.functions.invoke('claim-mine', {
    body: {
      code: input.code,
      customer_id: input.customerId,
      shipping_address: input.shippingAddress,
      delivery_date: input.deliveryDate,
      delivery_time_code: input.deliveryTimeCode,
      payment_method: input.paymentMethod,
      force_new_order: input.forceNewOrder ?? false,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { order_code: string; order_id: string }
}
