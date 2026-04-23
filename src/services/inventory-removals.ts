import { supabase } from '@/lib/supabase'
import type { InventoryRemovalReason, InventoryRemovalStatus, InventoryRemoval } from '@/lib/types'

// --- Types ---

interface CreateInventoryRemovalInput {
  item_id: string
  reason: InventoryRemovalReason
  reason_text?: string
  notes?: string
}

interface RemovalFilters {
  search?: string
  status?: string
}

// --- Create ---

export async function createInventoryRemoval(input: CreateInventoryRemovalInput) {
  // Generate RM-code
  const { data: removalCode, error: codeError } = await supabase.rpc('generate_code', {
    prefix: 'RM',
    seq_name: 'rm_code_seq',
  })
  if (codeError) throw codeError

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inventory_removals')
    .insert({
      removal_code: removalCode as string,
      item_id: input.item_id,
      reason: input.reason,
      reason_text: input.reason_text ?? null,
      notes: input.notes ?? null,
      requested_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as InventoryRemoval
}

// --- Queries ---

export async function getInventoryRemovals(filters: RemovalFilters = {}) {
  let query = supabase
    .from('inventory_removals')
    .select(`
      *,
      items(item_code, brand, model_name, color, condition_grade)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `removal_code.ilike.%${filters.search}%`
    )
  }
  if (filters.status) {
    query = query.eq('removal_status', filters.status)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getInventoryRemoval(id: string) {
  const { data, error } = await supabase
    .from('inventory_removals')
    .select(`
      *,
      items(
        id, item_code, brand, model_name, color, condition_grade,
        purchase_price, item_status,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// --- Approve ---

export async function approveRemoval(id: string) {
  const { data: { user } } = await supabase.auth.getUser()

  // Get the removal to find the item_id
  const { data: existing, error: fetchError } = await supabase
    .from('inventory_removals')
    .select('item_id')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const { data, error } = await supabase
    .from('inventory_removals')
    .update({
      removal_status: 'APPROVED' as InventoryRemovalStatus,
      approved_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Set item status to REMOVED
  await supabase
    .from('items')
    .update({ item_status: 'REMOVED' })
    .eq('id', existing.item_id)

  return data as InventoryRemoval
}

// --- Reject ---

export async function rejectRemoval(id: string, rejectionReason: string) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inventory_removals')
    .update({
      removal_status: 'REJECTED' as InventoryRemovalStatus,
      approved_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as InventoryRemoval
}
