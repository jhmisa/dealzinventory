import { createClient } from "jsr:@supabase/supabase-js@2";
import type { VisionImage } from "./ai-vision.ts";

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
  effective_price: number;
  selling_price: number;
  discount_amount: number;
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

// Render a single order line item as a human-readable string for the prompt.
// Prefers "Brand Model (P-code)"; falls back to the bare P-code when the
// product model is unknown.
export function formatOrderItem(
  item: { item_code: string; product_models: { brand: string; model_name: string } | null },
): string {
  const pm = item.product_models;
  if (pm && (pm.brand || pm.model_name)) {
    return `${pm.brand ?? ''} ${pm.model_name ?? ''} (${item.item_code})`.replace(/\s+/g, ' ').trim();
  }
  return item.item_code;
}

// Return the order_code of the single most recent order across active + recent,
// so the formatter can mark it (resolves "my order" / "binili ko"). Null if none.
export function mostRecentOrderCode(
  activeOrders: { order_code: string; created_at: string }[],
  recentOrders: { order_code: string; created_at: string }[],
): string | null {
  const all = [...activeOrders, ...recentOrders];
  if (all.length === 0) return null;
  let best = all[0];
  for (const o of all) {
    if (o.created_at > best.created_at) best = o;
  }
  return best.order_code;
}

export function formatContextForPrompt(context: AIContext): string {
  const sections: string[] = [];
  const recentCode = mostRecentOrderCode(context.activeOrders, context.recentOrders);
  const mark = (code: string) => (code === recentCode ? ' ← most recent' : '');

  if (context.customer) {
    const c = context.customer;
    sections.push(`## Customer\n- Code: ${c.customer_code}\n- Name: ${`${c.first_name ?? ''} ${c.last_name}`.trim()}\n- Email: ${c.email ?? 'N/A'}\n- Phone: ${c.phone ?? 'N/A'}`);
  } else {
    sections.push('## Customer\nUnknown — this is a new or unmatched contact. Use general knowledge only.');
  }

  if (context.activeOrders.length > 0) {
    const lines = context.activeOrders.map((o) => {
      let line = `- ${o.order_code}${mark(o.order_code)}: status=${o.order_status}, total=¥${o.total_price}`;
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
      (o) => `- ${o.order_code}${mark(o.order_code)}: ${o.order_status}, ¥${o.total_price}, ${o.created_at.slice(0, 10)}`
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
      (i) => {
        const priceStr = i.discount_amount > 0
          ? `¥${i.effective_price.toLocaleString()} (was ¥${i.selling_price.toLocaleString()}, −¥${i.discount_amount.toLocaleString()})`
          : `¥${i.effective_price.toLocaleString()}`;
        return `- ${i.brand} ${i.model_name} (${i.specs}) | Grade ${i.condition_grade} | ${priceStr} | ${i.stock_count} in stock | ${i.sell_group_code}`;
      }
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
      order_items(items(item_code, product_models(brand, model_name)))
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
    items: ((o.order_items as Array<{ items: { item_code: string; product_models: { brand: string; model_name: string } | null } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => formatOrderItem(oi.items!)),
  }));
}

async function getRecentOrders(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  limit: number,
): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_code, order_status, total_price, tracking_number, yamato_status, shipped_date, delivery_date, delivery_issue_flag, created_at, order_items(items(item_code, product_models(brand, model_name)))')
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
    items: ((o.order_items as Array<{ items: { item_code: string; product_models: { brand: string; model_name: string } | null } | null }>) ?? [])
      .filter((oi) => oi.items)
      .map((oi) => formatOrderItem(oi.items!)),
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
      sell_group_code, condition_grade, discount_amount,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, os_family,
        categories(name)),
      sell_group_items(items(selling_price, item_status, condition_grade))
    `)
    .eq('active', true)
    .limit(80);

  if (error || !data) return [];

  type SgRow = {
    sell_group_code: string;
    condition_grade: string;
    discount_amount: number | null;
    product_models: {
      brand: string;
      model_name: string;
      color: string | null;
      cpu: string | null;
      ram_gb: string | null;
      storage_gb: string | null;
      os_family: string | null;
      categories: { name: string } | null;
    } | null;
    sell_group_items: Array<{ items: { selling_price: number | null; item_status: string; condition_grade: string } | null }> | null;
  };

  // Compute effective price from a representative AVAILABLE member item
  const enriched = (data as unknown as SgRow[])
    .map((sg) => {
      const sgItems = sg.sell_group_items ?? [];
      const stockCount = sgItems.filter(s => s.items?.item_status === 'AVAILABLE' && s.items?.condition_grade !== 'J').length;
      const repSp = Number(sgItems.map(s => s.items?.selling_price).find(p => p != null) ?? 0);
      const discount = Number(sg.discount_amount ?? 0);
      const effective = Math.max(0, repSp - discount);
      return { sg, stockCount, repSp, discount, effective };
    })
    .filter(e => e.stockCount > 0)
    .sort((a, b) => a.effective - b.effective)
    .slice(0, 50);

  return enriched.map(({ sg, stockCount, repSp, discount, effective }) => {
    const pm = sg.product_models;
    const specParts = [pm?.color, pm?.cpu, pm?.ram_gb ? `${pm.ram_gb}GB` : null, pm?.storage_gb ? `${pm.storage_gb}GB` : null, pm?.os_family].filter(Boolean);

    return {
      sell_group_code: sg.sell_group_code,
      brand: pm?.brand ?? 'Unknown',
      model_name: pm?.model_name ?? 'Unknown',
      category: pm?.categories?.name ?? null,
      specs: specParts.join(' / ') || 'N/A',
      condition_grade: sg.condition_grade,
      effective_price: effective,
      selling_price: repSp,
      discount_amount: discount,
      stock_count: stockCount,
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
    // SENT only: a rejected/stale DRAFT must not look like a reply we actually sent,
    // or the model thinks it already answered and re-asks / contradicts itself.
    .eq('status', 'SENT')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  // Reverse so they're in chronological order
  return (data as MessageSummary[]).reverse();
}

// Load the recent SENT messages from a customer's most recent conversation.
// Used by the AI Test Playground so the AI sees the customer's real thread
// (what they and our agents said) — not just their orders/profile. Returns []
// when the customer has no conversation yet.
export async function getRecentMessagesByCustomer(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<MessageSummary[]> {
  const { data: convo, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle() as { data: { id: string } | null; error: unknown };

  if (error || !convo?.id) return [];
  return getRecentMessages(supabase, convo.id);
}

// ---------- Vision: latest customer screenshots ----------

export interface ImageAttachmentMeta {
  file_url: string;
  mime_type: string;
}

interface MessageWithAttachments {
  role: string;
  attachments: unknown;
}

// Pure: collect image attachments from the trailing run of customer messages
// (everything after the last non-customer message), capped at maxImages.
export function selectLatestCustomerImageAttachments(
  messages: MessageWithAttachments[],
  maxImages: number,
): ImageAttachmentMeta[] {
  // Walk backwards, stop at the first non-customer message.
  const burst: MessageWithAttachments[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'customer') break;
    burst.unshift(messages[i]);
  }

  const out: ImageAttachmentMeta[] = [];
  for (const msg of burst) {
    if (!Array.isArray(msg.attachments)) continue;
    for (const att of msg.attachments as Array<Record<string, unknown>>) {
      const mime = String(att?.mime_type ?? '');
      const url = att?.file_url;
      if (mime.startsWith('image/') && typeof url === 'string') {
        out.push({ file_url: url, mime_type: mime });
        if (out.length >= maxImages) return out;
      }
    }
  }
  return out;
}

// IO: download image attachments from the messaging-attachments bucket and
// base64-encode them for inline vision requests. Skips anything that fails
// or is too large. Mirrors the encoding used by send-message.
const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024; // keep request payloads sane

async function downloadImagesAsBase64(
  supabase: ReturnType<typeof createClient>,
  metas: ImageAttachmentMeta[],
): Promise<VisionImage[]> {
  const images: VisionImage[] = [];
  for (const meta of metas) {
    try {
      const { data, error } = await supabase.storage
        .from('messaging-attachments')
        .download(meta.file_url);
      if (error || !data) {
        console.error(`Vision: failed to download ${meta.file_url}:`, error);
        continue;
      }
      const arrayBuffer = await data.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_VISION_IMAGE_BYTES) {
        console.warn(`Vision: skipping ${meta.file_url} (${arrayBuffer.byteLength} bytes > cap)`);
        continue;
      }
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      images.push({ base64: btoa(binary), mediaType: meta.mime_type });
    } catch (err) {
      console.error(`Vision: error processing ${meta.file_url}:`, err);
    }
  }
  return images;
}

// IO: fetch the latest customer screenshots for a conversation, ready to send to a model.
export async function getLatestCustomerImages(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  maxImages = 3,
): Promise<VisionImage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, attachments, created_at')
    .eq('conversation_id', conversationId)
    .in('status', ['SENT', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  // Reverse to chronological so the trailing-customer-burst logic works.
  const chronological = (data as MessageWithAttachments[]).slice().reverse();
  const metas = selectLatestCustomerImageAttachments(chronological, maxImages);
  if (metas.length === 0) return [];
  return downloadImagesAsBase64(supabase, metas);
}
