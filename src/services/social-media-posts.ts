import { supabase } from '@/lib/supabase'
import type {
  SocialMediaPost,
  SocialMediaPostInsert,
  SocialMediaPostUpdate,
  SocialMediaPostWithItem,
} from '@/lib/types'

export async function getSocialMediaPosts() {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select(`
      *,
      items(id, item_code, condition_grade, selling_price, product_models(brand, model_name))
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as SocialMediaPostWithItem[]
}

export async function getSocialMediaPost(id: string) {
  const { data, error } = await supabase
    .from('social_media_posts')
    .select(`
      *,
      items(id, item_code, condition_grade, selling_price, product_models(brand, model_name))
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as SocialMediaPostWithItem
}

export async function createSocialMediaPost(post: SocialMediaPostInsert) {
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch item specs for embedding
  let itemSpecs = {}
  const isSellGroup = post.item_code?.startsWith('G')

  if (isSellGroup && post.item_code) {
    // Sell group: fetch specs via photo_groups → product_models
    const { data: sg } = await supabase
      .from('sell_groups')
      .select(`
        condition_grade, base_price,
        photo_groups(product_models(brand, model_name, model_number, part_number, year, screen_size, other_features))
      `)
      .eq('sell_group_code', post.item_code)
      .single()

    if (sg) {
      const pg = sg.photo_groups as Record<string, unknown> | null
      const pm = (pg?.product_models ?? null) as Record<string, unknown> | null
      itemSpecs = {
        brand: pm?.brand ?? null,
        model_name: pm?.model_name ?? null,
        model_number: pm?.model_number ?? null,
        part_number: pm?.part_number ?? null,
        year: pm?.year ?? null,
        screen_size: pm?.screen_size ?? null,
        other_features: pm?.other_features ?? null,
        condition_grade: sg.condition_grade,
        selling_price: sg.base_price,
      }
    }
  } else if (post.item_id) {
    const { data: item } = await supabase
      .from('items')
      .select(`
        condition_grade, selling_price, color, condition_notes,
        ram_gb, storage_gb, cpu, gpu, os_family,
        product_models(brand, model_name, model_number, part_number, year, screen_size, other_features)
      `)
      .eq('id', post.item_id)
      .single()

    if (item) {
      const pm = item.product_models as Record<string, unknown> | null
      itemSpecs = {
        brand: pm?.brand ?? null,
        model_name: pm?.model_name ?? null,
        model_number: pm?.model_number ?? null,
        part_number: pm?.part_number ?? null,
        year: pm?.year ?? null,
        ram_gb: item.ram_gb,
        storage_gb: item.storage_gb,
        cpu: item.cpu,
        gpu: item.gpu,
        screen_size: pm?.screen_size ?? null,
        color: item.color,
        os_family: item.os_family,
        other_features: pm?.other_features ?? null,
        condition_grade: item.condition_grade,
        selling_price: item.selling_price,
        condition_notes: item.condition_notes,
      }
    }
  }

  const insertData = {
    ...post,
    created_by: user?.id ?? null,
    item_specs: itemSpecs,
    ...(isSellGroup ? { item_id: null } : {}),
  }

  const { data, error } = await supabase
    .from('social_media_posts')
    .insert(insertData)
    .select()
    .single()

  if (error) throw error
  return data as SocialMediaPost
}

export async function updateSocialMediaPost(id: string, updates: SocialMediaPostUpdate) {
  const { data, error } = await supabase
    .from('social_media_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as SocialMediaPost
}

export async function deleteSocialMediaPost(id: string) {
  const { error } = await supabase
    .from('social_media_posts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export interface MediaItem {
  url: string
  thumbnail_url: string | null
  media_type: string
  source: 'Product' | 'Item' | 'Accessory'
}

export type MediaSourceType = 'item' | 'accessory' | 'sell_group'

export async function getMediaForSource(
  sourceType: MediaSourceType,
  sourceId: string,
  productId?: string | null,
  accessoryId?: string | null,
): Promise<MediaItem[]> {
  const results: MediaItem[] = []

  if (sourceType === 'accessory' && accessoryId) {
    // Accessory media
    const { data: accMedia } = await supabase
      .from('accessory_media')
      .select('file_url, media_type, sort_order')
      .eq('accessory_id', accessoryId)
      .order('sort_order')

    if (accMedia) {
      for (const m of accMedia) {
        results.push({
          url: m.file_url,
          thumbnail_url: null,
          media_type: m.media_type ?? 'image',
          source: 'Accessory',
        })
      }
    }
    return results
  }

  // For items and sell groups, fetch product media + item media
  if (productId) {
    const { data: productMedia } = await supabase
      .from('product_media')
      .select('file_url, media_type, sort_order')
      .eq('product_id', productId)
      .order('sort_order')

    if (productMedia) {
      for (const m of productMedia) {
        results.push({
          url: m.file_url,
          thumbnail_url: null,
          media_type: m.media_type ?? 'image',
          source: 'Product',
        })
      }
    }
  }

  if (sourceType === 'item') {
    const { data: itemMedia } = await supabase
      .from('item_media')
      .select('file_url, media_type, sort_order, thumbnail_url')
      .eq('item_id', sourceId)
      .order('sort_order')

    if (itemMedia) {
      for (const m of itemMedia) {
        results.push({
          url: m.file_url,
          thumbnail_url: m.thumbnail_url ?? null,
          media_type: m.media_type ?? 'image',
          source: 'Item',
        })
      }
    }
  }

  if (sourceType === 'sell_group') {
    // For sell groups, get media from the first item in the group
    const { data: sgItems } = await supabase
      .from('sell_group_items')
      .select('item_id')
      .eq('sell_group_id', sourceId)
      .limit(1)

    if (sgItems?.[0]) {
      const { data: itemMedia } = await supabase
        .from('item_media')
        .select('file_url, media_type, sort_order, thumbnail_url')
        .eq('item_id', sgItems[0].item_id)
        .order('sort_order')

      if (itemMedia) {
        for (const m of itemMedia) {
          results.push({
            url: m.file_url,
            thumbnail_url: m.thumbnail_url ?? null,
            media_type: m.media_type ?? 'image',
            source: 'Item',
          })
        }
      }
    }
  }

  return results
}
