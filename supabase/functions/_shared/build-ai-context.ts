import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------- Types ----------

export interface AIContext {
  customer: CustomerSummary | null;
  activeOrders: OrderSummary[];
  recentOrders: OrderSummary[];
  kaitoriRequests: KaitoriSummary[];
  recentMessages: MessageSummary[];
}

interface CustomerSummary {
  customer_code: string;
  last_name: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
}

interface OrderSummary {
  order_code: string;
  order_status: string;
  total_price: number;
  tracking_number: string | null;
  yamato_status: string | null;
  shipped_date: string | null;
  delivery_date: string | null;
  delivery_issue_flag: boolean;
  created_at: string;
  items: string[];
}

interface KaitoriSummary {
  kaitori_code: string;
  request_status: string;
  auto_quote_price: number | null;
  final_price: number | null;
  created_at: string;
}

interface MessageSummary {
  role: string;
  content: string;
  created_at: string;
}

// ---------- Context Assembly ----------

export async function buildCustomerContext(
  supabase: ReturnType<typeof createClient>,
  customerId: string | null,
  conversationId: string,
): Promise<AIContext> {
  // Always fetch recent messages for conversation context
  const recentMessages = await getRecentMessages(supabase, conversationId);

  if (!customerId) {
    return {
      customer: null,
      activeOrders: [],
      recentOrders: [],
      kaitoriRequests: [],
      recentMessages,
    };
  }

  // Fetch all customer data in parallel
  const [customer, activeOrders, recentOrders, kaitoriRequests] = await Promise.all([
    getCustomerSummary(supabase, customerId),
    getActiveOrders(supabase, customerId),
    getRecentOrders(supabase, customerId, 5),
    getKaitoriRequests(supabase, customerId),
  ]);

  return {
    customer,
    activeOrders,
    recentOrders,
    kaitoriRequests,
    recentMessages,
  };
}

// ---------- Summary formatters for AI prompt ----------

export function formatContextForPrompt(context: AIContext): string {
  const sections: string[] = [];

  if (context.customer) {
    const c = context.customer;
    sections.push(`## Customer\n- Code: ${c.customer_code}\n- Name: ${c.last_name} ${c.first_name ?? ''}\n- Email: ${c.email ?? 'N/A'}\n- Phone: ${c.phone ?? 'N/A'}`);
  } else {
    sections.push('## Customer\nUnknown — this is a new or unmatched contact. Use general knowledge only.');
  }

  if (context.activeOrders.length > 0) {
    const lines = context.activeOrders.map((o) => {
      let line = `- ${o.order_code}: status=${o.order_status}, total=¥${o.total_price}`;
      if (o.tracking_number) line += `, tracking=${o.tracking_number}`;
      if (o.yamato_status) line += `, yamato=${o.yamato_status}`;
      if (o.shipped_date) line += `, shipped=${o.shipped_date}`;
      if (o.delivery_date) line += `, delivery=${o.delivery_date}`;
      if (o.delivery_issue_flag) line += ' ⚠️ DELIVERY ISSUE';
      if (o.items.length > 0) line += `\n  Items: ${o.items.join(', ')}`;
      return line;
    });
    sections.push(`## Active Orders\n${lines.join('\n')}`);
  }

  if (context.recentOrders.length > 0) {
    const lines = context.recentOrders.map(
      (o) => `- ${o.order_code}: ${o.order_status}, ¥${o.total_price}, ${o.created_at.slice(0, 10)}`
    );
    sections.push(`## Recent Orders (last 5)\n${lines.join('\n')}`);
  }

  if (context.kaitoriRequests.length > 0) {
    const lines = context.kaitoriRequests.map(
      (k) => `- ${k.kaitori_code}: ${k.request_status}, quote=¥${k.auto_quote_price ?? 'N/A'}, final=¥${k.final_price ?? 'N/A'}`
    );
    sections.push(`## Kaitori Requests\n${lines.join('\n')}`);
  }

  if (context.recentMessages.length > 0) {
    const lines = context.recentMessages.map(
      (m) => `[${m.role}] ${m.content}`
    );
    sections.push(`## Recent Conversation (last 20 messages)\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

// ---------- Data fetchers ----------

async function getCustomerSummary(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<CustomerSummary | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('customer_code, last_name, first_name, email, phone')
    .eq('id', customerId)
    .single();

  if (error) return null;
  return data as CustomerSummary;
}

async function getActiveOrders(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<OrderSummary[]> {
  const activeStatuses = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED'];
  const { data, error } = await supabase
    .from('orders')
    .select(`
      order_code, order_status, total_price, tracking_number,
      yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at,
      order_items(items(item_code))
    `)
    .eq('customer_id', customerId)
    .in('order_status', activeStatuses)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((o: Record<string, unknown>) => ({
    order_code: o.order_code as string,
    order_status: o.order_status as string,
    total_price: o.total_price as number,
    tracking_number: o.tracking_number as string | null,
    yamato_status: o.yamato_status as string | null,
    shipped_date: o.shipped_date as string | null,
    delivery_date: o.delivery_date as string | null,
    delivery_issue_flag: o.delivery_issue_flag as boolean,
    created_at: o.created_at as string,
    items: ((o.order_items as Array<{ items: { item_code: string } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => oi.items!.item_code),
  }));
}

async function getRecentOrders(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  limit: number,
): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_code, order_status, total_price, tracking_number, yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((o: Record<string, unknown>) => ({
    order_code: o.order_code as string,
    order_status: o.order_status as string,
    total_price: o.total_price as number,
    tracking_number: o.tracking_number as string | null,
    yamato_status: o.yamato_status as string | null,
    shipped_date: o.shipped_date as string | null,
    delivery_date: o.delivery_date as string | null,
    delivery_issue_flag: o.delivery_issue_flag as boolean,
    created_at: o.created_at as string,
    items: [],
  }));
}

async function getKaitoriRequests(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<KaitoriSummary[]> {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .select('kaitori_code, request_status, auto_quote_price, final_price, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data) return [];
  return data as KaitoriSummary[];
}

async function getRecentMessages(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
): Promise<MessageSummary[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .in('status', ['SENT', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  // Reverse so they're in chronological order
  return (data as MessageSummary[]).reverse();
}
