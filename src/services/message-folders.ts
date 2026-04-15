import { supabase } from '@/lib/supabase'
import type { MessageFolder } from '@/lib/types'

export async function getMessageFolders(): Promise<MessageFolder[]> {
  const { data, error } = await supabase
    .from('message_folders')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getAwaitingReplyCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_awaiting_reply_counts')

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.folder_id] = row.count
  }
  return counts
}

export async function createMessageFolder(
  folder: Pick<MessageFolder, 'name' | 'icon' | 'sort_order'>
): Promise<MessageFolder> {
  const { data, error } = await supabase
    .from('message_folders')
    .insert(folder)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateMessageFolder(
  id: string,
  updates: Partial<Pick<MessageFolder, 'name' | 'icon' | 'sort_order'>>
): Promise<MessageFolder> {
  const { data, error } = await supabase
    .from('message_folders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteMessageFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('message_folders')
    .delete()
    .eq('id', id)
    .eq('is_system', false)

  if (error) throw error
}

export async function moveConversationToFolder(
  conversationId: string,
  folderId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ folder_id: folderId })
    .eq('id', conversationId)

  if (error) throw error
}
