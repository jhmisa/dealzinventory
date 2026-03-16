import { supabase } from '@/lib/supabase'
import type { Order, OrderInsert, OrderUpdate } from '@/lib/types'

interface OrderFilters {
  search?: string
  status?: string
  source?: string
  customerId?: string
}

export async function getOrders(filters: OrderFilters = {}) {
  let query = supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, cpu, ram_gb, storage_gb)
      ),
      order_items(count)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.ilike('order_code', `%${filters.search}%`)
  }
  if (filters.status) {
    query = query.eq('order_status', filters.status)
  }
  if (filters.source) {
    query = query.eq('order_source', filters.source)
  }
  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      ),
      order_items(
        id, packed_at, packed_by,
        items(id, item_code, condition_grade, item_status)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function generateOrderCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'ORD',
    seq_name: 'ord_code_seq',
  })

  if (error) throw error
  return data as string
}

export async function createOrder(order: OrderInsert) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

export async function updateOrder(id: string, updates: OrderUpdate) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

export async function updateOrderStatus(id: string, status: string) {
  return updateOrder(id, { order_status: status as Order['order_status'] })
}

// Mark an order item as packed
export async function packOrderItem(orderItemId: string, packedBy: string) {
  const { data, error } = await supabase
    .from('order_items')
    .update({ packed_at: new Date().toISOString(), packed_by: packedBy })
    .eq('id', orderItemId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Get orders ready for packing (CONFIRMED status)
export async function getPackableOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name),
      sell_groups(sell_group_code, condition_grade,
        product_models(brand, model_name)
      ),
      order_items(
        id, packed_at,
        items(id, item_code)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
