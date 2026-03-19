import { supabase } from '@/lib/supabase'

export interface ItemDefect {
  id: string
  item_id: string
  area: string
  defect_type: string
  description: string | null
  photo_url: string | null
  created_at: string
  created_by: string | null
}

export async function getItemDefects(itemId: string): Promise<ItemDefect[]> {
  const { data, error } = await supabase
    .from('item_defects')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addItemDefect(params: {
  itemId: string
  area: string
  defectType: string
  description?: string
  photoUrl?: string
}): Promise<ItemDefect> {
  // Get current user for audit trail
  const { data: { session } } = await supabase.auth.getSession()

  const { data, error } = await supabase
    .from('item_defects')
    .insert({
      item_id: params.itemId,
      area: params.area,
      defect_type: params.defectType,
      description: params.description ?? null,
      photo_url: params.photoUrl ?? null,
      created_by: session?.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteItemDefect(defectId: string) {
  const { error } = await supabase
    .from('item_defects')
    .delete()
    .eq('id', defectId)
  if (error) throw error
}
