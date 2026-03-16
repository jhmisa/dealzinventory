import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierInsert, SupplierUpdate } from '@/lib/types'

export async function getSuppliers(search?: string) {
  let query = supabase
    .from('suppliers')
    .select('*, items(count)')
    .order('supplier_name')

  if (search) {
    query = query.ilike('supplier_name', `%${search}%`)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((s) => ({
    ...s,
    item_count: (s.items as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
}

export async function getSupplier(id: string) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Supplier
}

export async function createSupplier(supplier: SupplierInsert) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplier)
    .select()
    .single()

  if (error) throw error
  return data as Supplier
}

export async function updateSupplier(id: string, updates: SupplierUpdate) {
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Supplier
}

export async function deleteSupplier(id: string) {
  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)

  if (error) throw error
}
