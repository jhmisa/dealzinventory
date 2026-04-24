import { supabase } from '@/lib/supabase'
import { formatCustomerName } from '@/lib/utils'
import type { Conversation } from '@/lib/types'

export interface TemplateContext {
  customer_name?: string
  customer_code?: string
  order_code?: string
}

/**
 * Resolve template context from a conversation by fetching the linked customer
 * and their most recent order.
 */
export async function resolveTemplateContext(
  conversation: Pick<Conversation, 'customer_id'>,
): Promise<TemplateContext> {
  const ctx: TemplateContext = {}

  if (!conversation.customer_id) return ctx

  // Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('first_name, last_name, customer_code')
    .eq('id', conversation.customer_id)
    .single()

  if (customer) {
    ctx.customer_name = formatCustomerName(customer)
    ctx.customer_code = customer.customer_code
  }

  // Fetch most recent order for this customer
  const { data: order } = await supabase
    .from('orders')
    .select('order_code')
    .eq('customer_id', conversation.customer_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (order) {
    ctx.order_code = order.order_code
  }

  return ctx
}

/**
 * Replace {{variable}} placeholders in content with values from context.
 * Unresolved variables are left as-is.
 */
export function resolveVariables(content: string, context: TemplateContext): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = context[key as keyof TemplateContext]
    return value ?? match
  })
}
