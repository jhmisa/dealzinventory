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

export async function getSystemSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data.value
}

export async function updateSystemSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })

  if (error) throw error
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
