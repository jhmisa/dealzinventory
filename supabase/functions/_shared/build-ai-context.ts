import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------- Types ----------

export interface AIContext {
  customer: CustomerSummary | null;
  activeOrders: OrderSummary[];
  recentOrders: OrderSummary[];
  kaitoriRequests: KaitoriSummary[];
  recentMessages: MessageSummary[];
  inventorySummary: InventoryItem[];
  availableItems: AvailableItemSummary[];
  accessorySummary: AccessoryItem[];
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

interface InventoryItem {
  sell_group_code: string;
  brand: string;
  model_name: string;
  category: string | null;
  specs: string;
  condition_grade: string;
  base_price: number;
  stock_count: number;
}

interface AvailableItemSummary {
  brand: string;
  model_name: string;
  specs: string;
  condition_grades: string[];
  price_range: string;
  count: number;
}

interface AccessoryItem {
  accessory_code: string;
  name: string;
  brand: string | null;
  selling_price: number;
  stock_quantity: number;
}

// ---------- Context Assembly ----------

export async function buildCustomerContext(
  supabase: ReturnType<typeof createClient>,
  customerId: string | null,
  conversationId: string,
): Promise<AIContext> {
  // Always fetch recent messages and inventory (not customer-specific)
  const [recentMessages, inventorySummary, availableItems, accessorySummary] = await Promise.all([
    getRecentMessages(supabase, conversationId),
    getInventorySummary(supabase),
    getAvailableItemsSummary(supabase),
    getAccessorySummary(supabase),
  ]);

  if (!customerId) {
    return {
      customer: null,
      activeOrders: [],
      recentOrders: [],
      kaitoriRequests: [],
      recentMessages,
      inventorySummary,
      availableItems,
      accessorySummary,
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
    inventorySummary,
    availableItems,
    accessorySummary,
  };
}

// ---------- Summary formatters for AI prompt ----------

export function formatContextForPrompt(context: AIContext): string {
  const sections: string[] = [];

  if (context.customer) {
    const c = context.customer;
    sections.push(`## Customer\n- Code: ${c.customer_code}\n- Name: ${`${c.first_name ?? ''} ${c.last_name}`.trim()}\n- Email: ${c.email ?? 'N/A'}\n- Phone: ${c.phone ?? 'N/A'}`);
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

  if (context.inventorySummary.length > 0) {
    const lines = context.inventorySummary.map(
      (i) => `- ${i.brand} ${i.model_name} (${i.specs}) | Grade ${i.condition_grade} | ¥${i.base_price.toLocaleString()} | ${i.stock_count} in stock | ${i.sell_group_code}`
    );
    sections.push(`## Available Inventory\n${lines.join('\n')}`);
  }

  if (context.availableItems.length > 0) {
    const lines = context.availableItems.map(
      (i) => `- ${i.brand} ${i.model_name} (${i.specs}) | Grades: ${i.condition_grades.join(', ')} | ${i.price_range} | ${i.count} in stock`
    );
    sections.push(`## Available Items\n${lines.join('\n')}`);
  }

  if (context.accessorySummary.length > 0) {
    const lines = context.accessorySummary.map(
      (a) => `- ${a.brand ? `${a.brand} ` : ''}${a.name} | ¥${a.selling_price.toLocaleString()} | ${a.stock_quantity} in stock | ${a.accessory_code}`
    );
    sections.push(`## Accessories in Stock\n${lines.join('\n')}`);
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

async function getInventorySummary(
  supabase: ReturnType<typeof createClient>,
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('sell_groups')
    .select(`
      sell_group_code, condition_grade, base_price,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, os_family,
        categories(name)),
      sell_group_items(count)
    `)
    .eq('active', true)
    .order('base_price', { ascending: true })
    .limit(80);

  if (error || !data) return [];

  // Filter to in-stock items and take top 50
  return data
    .filter((sg: Record<string, unknown>) => {
      const counts = sg.sell_group_items as Array<{ count: number }> | null;
      return counts && counts.length > 0 && counts[0].count > 0;
    })
    .slice(0, 50)
    .map((sg: Record<string, unknown>) => {
      const pm = sg.product_models as {
        brand: string;
        model_name: string;
        color: string | null;
        cpu: string | null;
        ram_gb: string | null;
        storage_gb: string | null;
        os_family: string | null;
        categories: { name: string } | null;
      } | null;

      const specParts = [pm?.color, pm?.cpu, pm?.ram_gb ? `${pm.ram_gb}GB` : null, pm?.storage_gb ? `${pm.storage_gb}GB` : null, pm?.os_family].filter(Boolean);
      const counts = sg.sell_group_items as Array<{ count: number }>;

      return {
        sell_group_code: sg.sell_group_code as string,
        brand: pm?.brand ?? 'Unknown',
        model_name: pm?.model_name ?? 'Unknown',
        category: pm?.categories?.name ?? null,
        specs: specParts.join(' / ') || 'N/A',
        condition_grade: sg.condition_grade as string,
        base_price: sg.base_price as number,
        stock_count: counts[0].count,
      };
    });
}

async function getAvailableItemsSummary(
  supabase: ReturnType<typeof createClient>,
): Promise<AvailableItemSummary[]> {
  // Fetch AVAILABLE items grouped by brand + model, with selling prices
  const { data, error } = await supabase
    .from('items')
    .select('brand, model_name, color, cpu, ram_gb, storage_gb, os_family, condition_grade, selling_price')
    .eq('item_status', 'AVAILABLE')
    .not('brand', 'is', null)
    .order('brand')
    .limit(300);

  if (error || !data) return [];

  // Group by brand + model_name
  const groups = new Map<string, {
    brand: string; model_name: string; specs: Set<string>;
    grades: Set<string>; prices: number[]; count: number;
  }>();

  for (const item of data as Array<{
    brand: string; model_name: string | null; color: string | null;
    cpu: string | null; ram_gb: string | null; storage_gb: string | null;
    os_family: string | null; condition_grade: string | null; selling_price: number | null;
  }>) {
    const key = `${item.brand}|${item.model_name ?? 'Unknown'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        brand: item.brand,
        model_name: item.model_name ?? 'Unknown',
        specs: new Set(),
        grades: new Set(),
        prices: [],
        count: 0,
      });
    }
    const g = groups.get(key)!;
    g.count++;
    if (item.condition_grade) g.grades.add(item.condition_grade);
    if (item.selling_price) g.prices.push(item.selling_price);
    const specParts = [item.color, item.cpu, item.ram_gb ? `${item.ram_gb}` : null, item.storage_gb ? `${item.storage_gb}` : null, item.os_family].filter(Boolean);
    if (specParts.length > 0) g.specs.add(specParts.join(' / '));
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
    .map((g) => {
      let priceRange = 'Price not set';
      if (g.prices.length > 0) {
        const min = Math.min(...g.prices);
        const max = Math.max(...g.prices);
        priceRange = min === max ? `¥${min.toLocaleString()}` : `¥${min.toLocaleString()}–¥${max.toLocaleString()}`;
      }
      return {
        brand: g.brand,
        model_name: g.model_name,
        specs: Array.from(g.specs).slice(0, 3).join(' | ') || 'N/A',
        condition_grades: Array.from(g.grades).sort(),
        price_range: priceRange,
        count: g.count,
      };
    });
}

async function getAccessorySummary(
  supabase: ReturnType<typeof createClient>,
): Promise<AccessoryItem[]> {
  const { data, error } = await supabase
    .from('accessories')
    .select('accessory_code, name, brand, selling_price, stock_quantity')
    .eq('active', true)
    .eq('shop_visible', true)
    .gt('stock_quantity', 0)
    .order('name')
    .limit(30);

  if (error || !data) return [];
  return data as AccessoryItem[];
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
