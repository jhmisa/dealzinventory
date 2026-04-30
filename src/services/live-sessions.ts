import { supabase } from '@/lib/supabase'

export interface SessionSaleInput {
  itemId: string
  itemCode: string
  description: string
  amount: number | null
  customerName: string
  orderId: string
  orderCode: string
}

export async function startLiveSession(staffName: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      staff_user_id: user.id,
      staff_name: staffName,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function endLiveSession(sessionId: string, totalSold: number) {
  const { error } = await supabase
    .from('live_sessions')
    .update({
      ended_at: new Date().toISOString(),
      total_sold: totalSold,
    })
    .eq('id', sessionId)

  if (error) throw error
}

export async function addSessionSale(sessionId: string, sale: SessionSaleInput) {
  const { error } = await supabase
    .from('live_session_sales')
    .insert({
      session_id: sessionId,
      item_id: sale.itemId,
      item_code: sale.itemCode,
      description: sale.description,
      amount: sale.amount,
      customer_name: sale.customerName,
      order_id: sale.orderId,
      order_code: sale.orderCode,
    })

  if (error) throw error
}

export async function getSessionSales(sessionId: string) {
  const { data, error } = await supabase
    .from('live_session_sales')
    .select('*')
    .eq('session_id', sessionId)
    .order('sold_at', { ascending: true })

  if (error) throw error
  return data
}

export async function getLiveSessions() {
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .order('started_at', { ascending: false })

  if (error) throw error
  return data
}
