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

    // Combine product media and item media
    const media: GalleryImage[] = []
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
      price: item.selling_price ?? 0,
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

    const productMedia = (pm?.product_media ?? []).sort((a, b) => a.sort_order - b.sort_order)
    const media: GalleryImage[] = productMedia.map(m => ({
      id: m.id, url: m.file_url, mediaType: m.media_type === 'video' ? 'video' : 'image',
    }))

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

// --- Claim (calls edge function) ---

interface ClaimMineInput {
  code: string
  customerId: string
  shippingAddress: string
  deliveryDate?: string | null
  deliveryTimeCode?: string | null
  paymentMethod?: string
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
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { order_code: string; order_id: string }
}
