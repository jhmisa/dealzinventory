import { supabase } from '@/lib/supabase'
import type { ContentCategory } from '@/lib/types'

export async function getContentCategories(): Promise<ContentCategory[]> {
  const { data, error } = await supabase
    .from('content_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as ContentCategory[]
}
