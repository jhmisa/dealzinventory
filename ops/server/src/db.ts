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

/**
 * Business-wide attention scan: what needs follow-up, what haven't we done yet?
 * Every category is a fixed, read-only query — thresholds tuned for Dealz's pace.
 */
export async function scanAttention() {
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

  // 1. Unanswered customers — last message is from the customer and it's been > 4h,
  //    whether or not anything flagged the conversation.
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id, needs_human_review, last_message_at, customers(customer_code, first_name, last_name)')
    .lt('last_message_at', hoursAgo(4))
    .gt('last_message_at', hoursAgo(24 * 14))
    .order('last_message_at', { ascending: true })
    .limit(60)
  if (convErr) throw new Error(convErr.message)
  const unanswered: Array<Record<string, unknown>> = []
  for (const c of convs ?? []) {
    if (unanswered.length >= 15) break
    const { data: last } = await supabase
      .from('messages').select('role, content, created_at')
      .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!last || last.role !== 'customer') continue
    const cust = c.customers as unknown as { customer_code?: string; first_name?: string; last_name?: string } | null
    unanswered.push({
      conversation_id: c.id,
      customer: cust ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.trim() || cust.customer_code : '(unmatched)',
      waiting: ageLabel(last.created_at, now),
      flagged: c.needs_human_review,
      last_message: truncate(last.content ?? '', 120),
    })
  }

  // 2. AI drafts nobody reviewed for > 24h.
  const { data: staleDrafts } = await supabase
    .from('messages')
    .select('id, conversation_id, content, created_at')
    .eq('status', 'DRAFT').eq('role', 'assistant')
    .lt('created_at', hoursAgo(24))
    .order('created_at', { ascending: true }).limit(10)

  // 3. Failed outbound messages in the last 7 days.
  const { data: failed } = await supabase
    .from('messages')
    .select('id, conversation_id, created_at')
    .eq('status', 'FAILED')
    .gt('created_at', hoursAgo(24 * 7))
    .order('created_at', { ascending: false }).limit(10)

  // 4. Open support tickets.
  const { data: tickets } = await supabase
    .from('tickets')
    .select('ticket_code, subject, priority, ticket_status, created_at')
    .in('ticket_status', ['OPEN', 'IN_PROGRESS'])
    .order('created_at', { ascending: true }).limit(15)

  // 5. Orders stuck before packing: PENDING > 2d, CONFIRMED > 5d.
  const [{ data: pendingOrders }, { data: confirmedOrders }] = await Promise.all([
    supabase.from('orders').select('order_code, order_status, total_price, created_at')
      .eq('order_status', 'PENDING').lt('created_at', hoursAgo(48))
      .order('created_at', { ascending: true }).limit(10),
    supabase.from('orders').select('order_code, order_status, total_price, created_at')
      .eq('order_status', 'CONFIRMED').lt('created_at', hoursAgo(24 * 5))
      .order('created_at', { ascending: true }).limit(10),
  ])
  const stuckOrders = [...(pendingOrders ?? []), ...(confirmedOrders ?? [])]

  // 6. Backorder units customers bought that we haven't ordered from the supplier yet.
  const { data: awaitingOrder } = await supabase
    .from('order_items')
    .select('backorder_status, quantity, created_at, orders(order_code), backorder_lines(backorder_code)')
    .eq('backorder_status', 'AWAITING_ORDER')
    .order('created_at', { ascending: true }).limit(15)

  // 7. Kaitori we owe action on: device in hand > 2d without inspection result;
  //    revised price the seller hasn't answered in > 3d; approved but unpaid > 2d.
  const [{ data: ktInHand }, { data: ktRevised }, { data: ktUnpaid }] = await Promise.all([
    supabase.from('kaitori_requests').select('kaitori_code, request_status, updated_at')
      .in('request_status', ['RECEIVED', 'INSPECTING']).lt('updated_at', hoursAgo(48))
      .order('updated_at', { ascending: true }).limit(10),
    supabase.from('kaitori_requests').select('kaitori_code, request_status, updated_at')
      .eq('request_status', 'PRICE_REVISED').lt('updated_at', hoursAgo(72))
      .order('updated_at', { ascending: true }).limit(10),
    supabase.from('kaitori_requests').select('kaitori_code, request_status, updated_at')
      .eq('request_status', 'APPROVED').lt('updated_at', hoursAgo(48))
      .order('updated_at', { ascending: true }).limit(10),
  ])
  const kaitori = [...(ktInHand ?? []), ...(ktRevised ?? []), ...(ktUnpaid ?? [])]

  // 8. Intake backlog: items sitting uninspected > 3d (count + oldest few).
  const { count: intakeCount } = await supabase
    .from('items').select('id', { count: 'exact', head: true })
    .eq('item_status', 'INTAKE').lt('created_at', hoursAgo(72))
  const { data: intakeOldest } = await supabase
    .from('items').select('item_code, brand, model_name, created_at')
    .eq('item_status', 'INTAKE').lt('created_at', hoursAgo(72))
    .order('created_at', { ascending: true }).limit(5)

  const age = (rows: Array<{ created_at?: string; updated_at?: string }> | null | undefined) =>
    (rows ?? []).map((r) => ({ ...r, age: ageLabel(r.created_at ?? r.updated_at ?? null, now) }))

  const categories = [
    { key: 'unanswered_customers', label: 'Customers waiting for a reply (>4h)', count: unanswered.length, items: unanswered },
    { key: 'stale_drafts', label: 'AI drafts unreviewed >24h', count: (staleDrafts ?? []).length, items: age(staleDrafts) },
    { key: 'failed_messages', label: 'Failed sends (last 7d)', count: (failed ?? []).length, items: age(failed) },
    { key: 'open_tickets', label: 'Open tickets', count: (tickets ?? []).length, items: age(tickets) },
    { key: 'stuck_orders', label: 'Orders stuck before packing', count: stuckOrders.length, items: age(stuckOrders) },
    { key: 'backorders_awaiting_order', label: 'Sold backorder units not yet ordered from supplier', count: (awaitingOrder ?? []).length, items: age(awaitingOrder as never) },
    { key: 'kaitori_followups', label: 'Kaitori needing action (inspect / seller nudge / pay)', count: kaitori.length, items: age(kaitori) },
    { key: 'intake_backlog', label: 'Items uninspected >3d', count: intakeCount ?? 0, items: age(intakeOldest) },
  ]
  const total = categories.reduce((s, c) => s + c.count, 0)
  return { scanned_at: now.toISOString(), total_findings: total, categories }
}

/** Informational write: file an attention BRIEFING for staff (one live briefing at a time). */
export async function proposeBriefing(p: { title: string; content: string }) {
  const row = {
    type: 'briefing',
    status: 'PENDING',
    summary: p.title,
    rationale: null,
    confidence: null,
    created_by: 'ops-agent',
    payload: { content: p.content },
    target_ref: null,
  }
  const { data: existing } = await supabase
    .from('ai_ops_proposals').select('id')
    .eq('status', 'PENDING').eq('type', 'briefing').maybeSingle()
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
