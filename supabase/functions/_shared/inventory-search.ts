import { createClient } from "jsr:@supabase/supabase-js@2";

export interface RawItemRow {
  id: string;
  item_code: string;
  condition_grade: string | null;
  selling_price: number | null;
  discount: number | null;
  brand: string | null;
  model_name: string | null;
  first_item_display_url: string | null;
  first_item_thumb_url: string | null;
  hero_media_url: string | null;
  first_product_media_url: string | null;
  condition_notes: string | null;
}

export interface RawSellGroupRow {
  id: string;
  sell_group_code: string;
  condition_grade: string | null;
  effective_price: number | null;
  available_count: number | null;
  brand: string | null;
  model_name: string | null;
  hero_media_url: string | null;
}

export interface InventorySearchResult {
  type: 'item' | 'sell_group';
  code: string;
  description: string;
  grade: string | null;
  price: number | null;
  available_count: number | null;
  thumbnail_url: string | null;
  display_url: string | null;
  order_url: string;
}

export interface InventorySearchArgs {
  query: string;
  category_id?: string;
  brand?: string;
  price_min?: number;
  price_max?: number;
}

export function buildOrderUrl(base: string, code: string): string {
  const root = base.replace(/\/shop\/?$/, '').replace(/\/$/, '');
  return `${root}/mine/${code}`;
}

function shopBase(): string {
  return Deno.env.get('PUBLIC_SHOP_URL') ?? 'https://dealzinventory.vercel.app';
}

export function mapInventoryResults(
  items: RawItemRow[],
  groups: RawSellGroupRow[],
  base: string,
): InventorySearchResult[] {
  const itemResults: InventorySearchResult[] = items.map((r) => {
    const discount = Number(r.discount) || 0;
    const price = r.selling_price != null ? Math.max(0, r.selling_price - discount) : null;
    const display = r.first_item_display_url ?? r.hero_media_url ?? r.first_product_media_url ?? null;
    const thumb = r.first_item_thumb_url ?? display;
    const desc = [r.brand, r.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'item' as const,
      code: r.item_code,
      description: r.condition_notes ? `${desc} — ${r.condition_notes}` : desc,
      grade: r.condition_grade,
      price,
      available_count: 1,
      thumbnail_url: thumb,
      display_url: display,
      order_url: buildOrderUrl(base, r.item_code),
    };
  });

  const groupResults: InventorySearchResult[] = groups.map((g) => {
    const desc = [g.brand, g.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'sell_group' as const,
      code: g.sell_group_code,
      description: `${desc} (${g.available_count ?? 0} available)`,
      grade: g.condition_grade,
      price: g.effective_price,
      available_count: g.available_count ?? 0,
      thumbnail_url: g.hero_media_url,
      display_url: g.hero_media_url,
      order_url: buildOrderUrl(base, g.sell_group_code),
    };
  });

  return [...groupResults, ...itemResults];
}

export async function searchInventory(
  supabase: ReturnType<typeof createClient>,
  args: InventorySearchArgs,
): Promise<InventorySearchResult[]> {
  const q = (args.query ?? '').trim();
  const common = {
    search_query: q,
    result_limit: 10,
    filter_brand: args.brand ?? null,
    filter_category_id: args.category_id ?? null,
    price_min: args.price_min ?? null,
    price_max: args.price_max ?? null,
  };

  // Call .rpc as a member access on the client so `this` stays bound — supabase-js'
  // rpc() reads `this.rest` internally, so a detached `const rpc = supabase.rpc`
  // reference throws "Cannot read properties of undefined (reading 'rest')".
  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const [itemsRes, groupsRes] = await Promise.all([
    db.rpc('search_available_inventory', common),
    db.rpc('search_available_sell_groups', common),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (groupsRes.error) throw groupsRes.error;

  // Cap total results to keep the LLM tool context small (token budget).
  return mapInventoryResults(
    (itemsRes.data ?? []) as RawItemRow[],
    (groupsRes.data ?? []) as RawSellGroupRow[],
    shopBase(),
  ).slice(0, 12);
}
