import { supabase } from '@/lib/supabase'
import type { ItemAuditLog } from '@/lib/types'

export async function getItemAuditLogs(itemId: string) {
  const { data, error } = await supabase
    .from('item_audit_logs')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as ItemAuditLog[]
}
