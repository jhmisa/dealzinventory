/**
 * THE whitelisted data-access surface for the dealz-ops MCP server.
 *
 * Every query the ops agent can trigger is enumerated in this file — nothing generic,
 * nothing destructive. The ONLY write is proposeReply/logActivity, and a proposal is an
 * inert queue row until a human approves it in the AI Operations page (PROPOSE mode).
 */
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SERVICE_ROLE_KEY } from './env.js'
import { truncate, ageLabel } from './lib.js'

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('system_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { value: string } | null)?.value ?? null
}

/** Escalated conversations (needs_human_review) with customer name + last message snippet. */
export async function surveyWorklist(limit = 25) {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, customer_id, channel, last_message_at, created_at, customers(customer_code, last_name, first_name)')
    .eq('needs_human_review', true)
    .order('last_message_at', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  const now = new Date()
  const out = []
  for (const c of convs ?? []) {
    const { data: last } = await supabase
      .from('messages').select('role, content, created_at')
      .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const { count } = await supabase
      .from('ai_ops_proposals').select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING').eq('type', 'reply').eq('payload->>conversation_id', c.id)
    const cust = c.customers as unknown as { customer_code?: string; last_name?: string; first_name?: string } | null
    out.push({
      conversation_id: c.id,
      customer: cust
        ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim() || cust.customer_code
        : '(unmatched contact)',
      channel: c.channel,
      waiting: ageLabel(c.last_message_at, now),
      last_message: last ? `[${last.role}] ${truncate(last.content ?? '', 160)}` : '(no messages)',
      has_pending_proposal: (count ?? 0) > 0,
    })
  }
  return out
}

/** Conversation meta + last N messages, chronological. */
export async function getConversation(conversationId: string, limit = 30) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, channel, needs_human_review, ai_enabled, last_message_at, customer_id')
    .eq('id', conversationId).maybeSingle()
  if (convErr) throw new Error(convErr.message)
  if (!conv) throw new Error(`Conversation not found: ${conversationId}`)
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('role, content, status, auto_sent, ai_confidence, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (msgErr) throw new Error(msgErr.message)
  return {
    conversation: conv,
    messages: (msgs ?? []).reverse().map((m) => ({
      role: m.role,
      content: truncate(m.content ?? '', 800),
      status: m.status,
      auto_sent: m.auto_sent,
      created_at: m.created_at,
    })),
  }
}

/** Customer identity + recent orders + kaitori requests for a conversation. */
export async function getCustomerContext(conversationId: string) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations').select('id, customer_id').eq('id', conversationId).maybeSingle()
  if (convErr) throw new Error(convErr.message)
  if (!conv) throw new Error(`Conversation not found: ${conversationId}`)
  if (!conv.customer_id) return { linked: false as const, note: 'No customer linked to this conversation yet.' }
  const [{ data: customer }, { data: orders }, { data: kaitori }] = await Promise.all([
    supabase.from('customers')
      .select('customer_code, last_name, first_name, email, phone, is_seller, created_at')
      .eq('id', conv.customer_id).maybeSingle(),
    supabase.from('orders')
      .select('order_code, order_status, total_price, created_at')
      .eq('customer_id', conv.customer_id).order('created_at', { ascending: false }).limit(5),
    supabase.from('kaitori_requests')
      .select('kaitori_code, status, created_at')
      .eq('customer_id', conv.customer_id).order('created_at', { ascending: false }).limit(3),
  ])
  return { linked: true as const, customer, recent_orders: orders ?? [], recent_kaitori: kaitori ?? [] }
}

/** Available stock across items, sell groups, and backorder pre-orders. Prices JPY. */
export async function searchInventory(
  query: string,
  opts: { brand?: string; price_min?: number; price_max?: number } = {},
) {
  const common = {
    search_query: query,
    result_limit: 10,
    filter_brand: opts.brand ?? null,
    filter_category_id: null,
    price_min: opts.price_min ?? null,
    price_max: opts.price_max ?? null,
  }
  const [items, groups, backorders] = await Promise.all([
    supabase.rpc('search_available_inventory', common),
    supabase.rpc('search_available_sell_groups', common),
    supabase.rpc('search_available_backorder_lines', common),
  ])
  for (const r of [items, groups, backorders]) {
    if (r.error) throw new Error(r.error.message)
  }
  type Row = Record<string, unknown>
  const spec = (r: Row) =>
    [r.model_number, r.storage_gb ? `${r.storage_gb}GB` : null, r.ram_gb ? `${r.ram_gb}GB RAM` : null, r.color, r.year]
      .filter(Boolean).join(' · ')
  const results = [
    ...((items.data ?? []) as Row[]).map((r) => ({
      code: r.item_code, kind: 'item', brand: r.brand, model: r.model_name, spec: spec(r),
      grade: r.condition_grade, price_jpy: r.selling_price, count: 1,
    })),
    ...((groups.data ?? []) as Row[]).map((r) => ({
      code: r.sell_group_code, kind: 'group', brand: r.brand, model: r.model_name, spec: spec(r),
      grade: r.condition_grade, price_jpy: r.effective_price, count: r.available_count,
    })),
    ...((backorders.data ?? []) as Row[]).map((r) => ({
      code: r.backorder_code, kind: 'backorder (pre-order)', brand: r.brand, model: r.model_name, spec: spec(r),
      grade: r.condition_grade, price_jpy: r.selling_price, count: r.available,
      lead_time_days: r.lead_time_days,
    })),
  ]
  return results.slice(0, 15)
}

/** Structured specs for one item/model via the get_item_full_specs RPC (code or fuzzy query). */
export async function getItemSpecs(codeOrQuery: string) {
  const isCode = /^[PGB]\d{6}$/i.test(codeOrQuery.trim())
  const { data, error } = await supabase.rpc('get_item_full_specs', {
    p_code: isCode ? codeOrQuery.trim().toUpperCase() : null,
    p_query: isCode ? null : codeOrQuery,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows[0] ?? { found: false, note: 'No match — ask the customer for the exact code.' }
}

/** Staff-approved correction examples (ground truth for tone + policy). */
export async function getCorrections(keyword: string | undefined, limit = 10) {
  let q = supabase
    .from('ai_corrections')
    .select('customer_message, correct_reply, note, specialist_slug')
    .in('status', ['APPROVED', 'PROMOTED'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (keyword) q = q.ilike('customer_message', `%${keyword}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listProposals(status?: string) {
  let q = supabase
    .from('ai_ops_proposals')
    .select('id, type, status, summary, confidence, target_ref, error, created_at, reviewed_at, review_note')
    .order('created_at', { ascending: false })
    .limit(50)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** The ONLY business write: upsert-replace the single PENDING reply proposal for a conversation. */
export async function proposeReply(p: {
  conversation_id: string
  content: string
  summary: string
  rationale?: string
  confidence?: number
}) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations').select('id').eq('id', p.conversation_id).maybeSingle()
  if (convErr) throw new Error(convErr.message)
  if (!conv) throw new Error(`Conversation not found: ${p.conversation_id}`)
  const row = {
    type: 'reply',
    status: 'PENDING',
    summary: p.summary,
    rationale: p.rationale ?? null,
    confidence: p.confidence ?? null,
    created_by: 'ops-agent',
    payload: { conversation_id: p.conversation_id, content: p.content },
    target_ref: p.conversation_id,
  }
  const { data: existing } = await supabase
    .from('ai_ops_proposals').select('id')
    .eq('status', 'PENDING').eq('type', 'reply')
    .eq('payload->>conversation_id', p.conversation_id).maybeSingle()
  if (existing) {
    const { data, error } = await supabase
      .from('ai_ops_proposals').update(row).eq('id', existing.id).select('id').single()
    if (error) throw new Error(error.message)
    return { proposal_id: data.id as string, replaced: true }
  }
  const { data, error } = await supabase
    .from('ai_ops_proposals').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return { proposal_id: data.id as string, replaced: false }
}

/** Audit log — every tool call lands here. Failures must never crash a tool. */
export async function logActivity(
  tool: string,
  args: Record<string, unknown>,
  resultSummary: string,
  proposalId?: string,
) {
  try {
    await supabase.from('ai_ops_activity').insert({
      tool, args, result_summary: truncate(resultSummary, 500), proposal_id: proposalId ?? null,
    })
  } catch {
    // audit hiccups are non-fatal by design
  }
}
