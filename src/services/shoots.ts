import { supabase } from '@/lib/supabase'
import type { Shoot, ShootInsert, ShootUpdate, ShootStatus } from '@/lib/types'

// A shoot row joined to its assignee's display name (for the board card).
export type ShootWithAssignee = Shoot & {
  assignee: { id: string; display_name: string } | null
}

export async function getShoots(): Promise<ShootWithAssignee[]> {
  const { data, error } = await supabase
    .from('shoots')
    .select('*, assignee:staff_profiles(id, display_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShootWithAssignee[]
}

export async function createShoot(input: ShootInsert): Promise<Shoot> {
  const { data, error } = await supabase.from('shoots').insert(input).select().single()
  if (error) throw error
  return data as Shoot
}

export async function updateShoot(id: string, updates: ShootUpdate): Promise<Shoot> {
  const { data, error } = await supabase.from('shoots').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data as Shoot
}

export async function updateShootStatus(id: string, status: ShootStatus): Promise<Shoot> {
  return updateShoot(id, { status })
}

export async function deleteShoot(id: string): Promise<void> {
  const { error } = await supabase.from('shoots').delete().eq('id', id)
  if (error) throw error
}
