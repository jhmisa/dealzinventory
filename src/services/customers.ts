import { supabase } from '@/lib/supabase'
import type { Customer, CustomerUpdate } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import { uppercaseAddress } from '@/lib/address-types'

interface CustomerFilters {
  search?: string
}

export async function getCustomers(filters: CustomerFilters = {}) {
  let query = supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `last_name.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,customer_code.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getCustomer(id: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getCustomerWithDetails(id: string) {
  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      orders(id, order_code, order_status, total_price, created_at),
      kaitori_requests(id, kaitori_code, request_status, auto_quote_price, final_price, created_at)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function updateCustomer(id: string, updates: CustomerUpdate) {
  if (updates.last_name) updates.last_name = updates.last_name.toUpperCase()
  if (updates.first_name) updates.first_name = updates.first_name.toUpperCase()

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Customer
}

export async function generateCustomerCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'CUST',
    seq_name: 'cust_code_seq',
  })

  if (error) throw error
  return data as string
}

export async function verifyCustomerId(id: string) {
  return updateCustomer(id, {
    id_verified: true,
    id_verified_at: new Date().toISOString(),
  })
}

export async function getCustomerOrders(customerId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      sell_groups(sell_group_code, product_models(brand, model_name, cpu, ram_gb, storage_gb))
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getCustomerKaitoriRequests(customerId: string) {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .select(`
      *,
      product_models(brand, model_name, cpu, ram_gb, storage_gb)
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// --- Admin Customer Creation ---

export async function createCustomer(params: {
  last_name: string
  first_name?: string
  email?: string
  phone?: string
  pin: string
  shipping_address?: ShippingAddress | null
  is_seller?: boolean
  bank_name?: string
  bank_branch?: string
  bank_account_number?: string
  bank_account_holder?: string
}) {
  const processedAddress = params.shipping_address
    ? uppercaseAddress(params.shipping_address)
    : undefined

  // Use the same Edge Function as public registration to handle PIN hashing
  const code = await generateCustomerCode()
  const { data, error } = await supabase.functions.invoke('customer-auth', {
    body: {
      action: 'register',
      customer_code: code,
      last_name: params.last_name.toUpperCase(),
      first_name: params.first_name?.toUpperCase() || undefined,
      email: params.email || undefined,
      phone: params.phone || undefined,
      pin: params.pin,
      shipping_address: processedAddress ?? undefined,
    },
  })

  if (error) {
    // Try to extract a meaningful message from the response data first
    if (data?.error) throw new Error(data.error)
    throw new Error(error.message ?? 'Failed to call customer-auth function')
  }
  if (data?.error) throw new Error(data.error)

  const customer = data.customer as Customer

  // If seller fields were provided, update the customer with those extra fields
  if (params.is_seller || params.bank_name || params.bank_branch || params.bank_account_number || params.bank_account_holder) {
    return updateCustomer(customer.id, {
      is_seller: params.is_seller ?? false,
      bank_name: params.bank_name || null,
      bank_branch: params.bank_branch || null,
      bank_account_number: params.bank_account_number || null,
      bank_account_holder: params.bank_account_holder || null,
    })
  }

  return customer
}

// --- Customer Auth (calls Edge Function) ---
// In production, these call the customer-auth Edge Function.
// For MVP, we implement a simplified client-side version.

export async function customerLogin(lastNam: string, emailOrPhone: string, pin: string) {
  // Call edge function for auth
  const { data, error } = await supabase.functions.invoke('customer-auth', {
    body: { action: 'login', last_name: lastNam, email_or_phone: emailOrPhone, pin },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { customer: Customer; token: string }
}

export async function customerRegister(params: {
  last_name: string
  first_name?: string
  email?: string
  phone?: string
  pin: string
  shipping_address?: ShippingAddress | null
}) {
  const processedAddress = params.shipping_address
    ? uppercaseAddress(params.shipping_address)
    : undefined

  const code = await generateCustomerCode()
  const { data, error } = await supabase.functions.invoke('customer-auth', {
    body: {
      action: 'register',
      customer_code: code,
      last_name: params.last_name.toUpperCase(),
      first_name: params.first_name?.toUpperCase() || undefined,
      email: params.email || undefined,
      phone: params.phone || undefined,
      pin: params.pin,
      shipping_address: processedAddress ?? undefined,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { customer: Customer; token: string }
}

export async function customerChangePin(customerId: string, currentPin: string, newPin: string) {
  const { data, error } = await supabase.functions.invoke('customer-auth', {
    body: { action: 'change_pin', customer_id: customerId, current_pin: currentPin, new_pin: newPin },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
