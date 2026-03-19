import { supabase } from '@/lib/supabase'
import type { ProductModel, ProductModelInsert, ProductModelUpdate, ProductModelWithHeroImage } from '@/lib/types'

export async function getProductModels(search?: string) {
  let query = supabase
    .from('product_models')
    .select('*, product_media(count), categories(name, form_fields, description_fields)')
    .order('brand')
    .order('model_name')

  if (search) {
    query = query.or(`brand.ilike.%${search}%,model_name.ilike.%${search}%,color.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((pm) => ({
    ...pm,
    media_count: (pm.product_media as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
}

export async function getProductModelsWithHeroImage(search?: string): Promise<ProductModelWithHeroImage[]> {
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
