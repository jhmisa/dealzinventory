import { supabase } from '@/lib/supabase'
import type { AccessoryMedia } from '@/lib/types'

export interface ShowcaseItem {
  id: string
  item_code: string
  selling_price: number | null
  purchase_price: number | null
  condition_grade: string | null
  condition_notes: string | null
  description: string
  photos: { id: string; url: string }[]
  videos: { id: string; url: string }[]
}

export async function getShowcaseItem(itemCode: string): Promise<ShowcaseItem | null> {
  // Find item by exact item_code
  const { data: match, error: matchError } = await supabase
    .from('items')
    .select('id')
    .eq('item_code', itemCode.toUpperCase())
    .single()

  if (matchError || !match) return null

  // Fetch full item with relations
  const { data, error } = await supabase
    .from('items')
    .select(`
      id, item_code, selling_price, purchase_price, condition_grade, condition_notes,
      product_models(
        brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      ),
      item_media(id, file_url, sort_order, visible, media_type, thumbnail_url)
    `)
    .eq('id', match.id)
    .single()

  if (error || !data) return null

  const pm = data.product_models as Record<string, unknown> | null
  const productMedia = (pm?.product_media ?? []) as Array<{ id: string; file_url: string; media_type: string; sort_order: number }>
  const itemMedia = (data.item_media ?? []) as Array<{ id: string; file_url: string; sort_order: number; visible: boolean; media_type: string }>

  // Build description from product model
  let description = ''
  if (pm) {
    description = (pm.short_description as string) || ''
    if (!description) {
      const parts = [pm.brand, pm.model_name, pm.cpu, pm.ram_gb ?? null, pm.storage_gb ?? null, pm.screen_size ? `${pm.screen_size}"` : null, pm.color].filter(Boolean)
      description = parts.join(' ')
    }
  }

  // Split product_media into photos and videos
  const photos = productMedia
    .filter((m) => m.media_type === 'image')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const itemPhotos = itemMedia
    .filter((m) => m.visible && m.media_type !== 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const itemVideos = itemMedia
    .filter((m) => m.visible && m.media_type === 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const videos = productMedia
    .filter((m) => m.media_type === 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  return {
    id: data.id,
    item_code: data.item_code,
    selling_price: data.selling_price,
    purchase_price: data.purchase_price,
    condition_grade: data.condition_grade,
    condition_notes: data.condition_notes,
    description,
    photos: [...photos, ...itemPhotos],
    videos: [...videos, ...itemVideos],
  }
}

export async function getShowcaseSellGroup(gCode: string): Promise<ShowcaseItem | null> {
  const { data: sg, error: sgError } = await supabase
    .from('sell_groups')
    .select(`
      id, sell_group_code, base_price, condition_grade,
      product_models(
        brand, model_name, color, short_description, cpu, ram_gb, storage_gb, screen_size,
        categories(name, description_fields),
        product_media(id, file_url, media_type, sort_order)
      )
    `)
    .ilike('sell_group_code', gCode.toUpperCase())
    .maybeSingle()

  if (sgError || !sg) return null

  const pm = sg.product_models as Record<string, unknown> | null
  const productMedia = (pm?.product_media ?? []) as Array<{ id: string; file_url: string; media_type: string; sort_order: number }>

  let description = ''
  if (pm) {
    description = (pm.short_description as string) || ''
    if (!description) {
      const parts = [pm.brand, pm.model_name, pm.cpu, pm.ram_gb ?? null, pm.storage_gb ?? null, pm.screen_size ? `${pm.screen_size}"` : null, pm.color].filter(Boolean)
      description = parts.join(' ')
    }
  }

  const photos = productMedia
    .filter((m) => m.media_type === 'image')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const videos = productMedia
    .filter((m) => m.media_type === 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  return {
    id: sg.id,
    item_code: sg.sell_group_code,
    selling_price: sg.base_price,
    purchase_price: null,
    condition_grade: sg.condition_grade,
    condition_notes: null,
    description,
    photos,
    videos,
  }
}

export async function getShowcaseAccessory(accessoryCode: string): Promise<ShowcaseItem | null> {
  const { data, error } = await supabase
    .from('accessories')
    .select(`
      id, accessory_code, name, brand, selling_price,
      accessory_media(id, file_url, media_type, sort_order)
    `)
    .eq('accessory_code', accessoryCode.toUpperCase())
    .single()

  if (error || !data) return null

  const media = (data.accessory_media ?? []) as AccessoryMedia[]

  const photos = media
    .filter((m) => m.media_type === 'image')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const videos = media
    .filter((m) => m.media_type === 'video')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.file_url }))

  const description = [data.brand, data.name].filter(Boolean).join(' ')

  return {
    id: data.id,
    item_code: data.accessory_code,
    selling_price: data.selling_price,
    purchase_price: null,
    condition_grade: null,
    condition_notes: null,
    description,
    photos,
    videos,
  }
}
