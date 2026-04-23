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

  const { data, error } = await supabase
    .from('social_media_posts')
    .insert({ ...post, created_by: user?.id ?? null })
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
