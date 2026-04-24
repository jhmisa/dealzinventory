import { supabase } from '@/lib/supabase'
import type { CustomerAddress, CustomerAddressInsert, CustomerAddressUpdate } from '@/lib/types'

export async function getCustomerAddresses(customerId: string) {
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as CustomerAddress[]
}

export async function createCustomerAddress(address: CustomerAddressInsert) {
  // If this is marked as default, unset other defaults first
  if (address.is_default) {
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', address.customer_id)
  }

  // Auto-generate label if not provided
  if (!address.label) {
    const { count } = await supabase
      .from('customer_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', address.customer_id)
    address.label = `Address ${(count ?? 0) + 1}`
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert(address)
    .select()
    .single()

  if (error) throw error
  return data as CustomerAddress
}

export async function updateCustomerAddress(id: string, updates: CustomerAddressUpdate) {
  const { data, error } = await supabase
    .from('customer_addresses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as CustomerAddress
}

export async function deleteCustomerAddress(id: string) {
  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', id)

  if (error) throw error
}
