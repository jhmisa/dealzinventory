import { supabase } from '@/lib/supabase'
import { getItemByCode, getItem } from '@/services/items'
import { getSellGroupByCode } from '@/services/sell-groups'
import { getAccessoryByCode } from '@/services/accessories'
import type { GalleryImage } from '@/components/shared/image-gallery'

export interface ClaimableProduct {
  type: 'item' | 'sell_group' | 'accessory'
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
  raw: {
    itemId?: string
    accessoryId?: string
    sellGroupId?: string
    productId?: string
  }
}

export function parseCode(code: string): { prefix: 'P' | 'G' | 'A'; digits: string } | null {
  const match = code.match(/^(P|G|A)(\d{6})$/i)
  if (!match) return null
  return { prefix: match[1].toUpperCase() as 'P' | 'G' | 'A', digits: match[2] }
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
    const specParts = [pm?.cpu, pm?.ram_gb, pm?.storage_gb, pm?.screen_size ? `${pm.screen_size}"` : null].filter(Boolean)
    const subtitle = pm?.short_description || specParts.join(' / ') || ''

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
    const productMedia = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
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
    const specParts = [pm?.cpu, pm?.ram_gb, pm?.storage_gb, pm?.screen_size ? `${pm.screen_size}"` : null].filter(Boolean)
    const subtitle = pm?.short_description || specParts.join(' / ') || ''

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

    // Count available items in the sell group
    const items = (sg.sell_group_items ?? []) as { items: { id: string; item_status: string; condition_grade: string } | null }[]
    const availableItems = items.filter(sgi => sgi.items?.item_status === 'AVAILABLE' && sgi.items?.condition_grade !== 'J')
    const available = sg.active === true && availableItems.length > 0

    return {
      type: 'sell_group',
      code,
      id: sg.id,
      title,
      subtitle,
      grade: sg.condition_grade,
      price: sg.base_price ?? 0,
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
