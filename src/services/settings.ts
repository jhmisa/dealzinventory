import { supabase } from '@/lib/supabase'
import type { ItemListColumnSetting } from '@/lib/types'

export async function getItemListColumnSettings() {
  const { data, error } = await supabase
    .from('item_list_column_settings')
    .select('*')
    .order('status_tab')

  if (error) throw error
  return data as ItemListColumnSetting[]
}

export async function updateItemListColumnSettings(
  statusTab: string,
  visibleColumns: string[]
) {
  const { error } = await supabase
    .from('item_list_column_settings')
    .upsert(
      { status_tab: statusTab, visible_columns: visibleColumns, updated_at: new Date().toISOString() },
      { onConflict: 'status_tab' }
    )

  if (error) throw error
}
