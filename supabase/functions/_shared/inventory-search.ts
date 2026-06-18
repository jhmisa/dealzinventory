import { createClient } from "jsr:@supabase/supabase-js@2";
import { getItemDescription } from "./item-description.ts";

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
  // Spec fields returned by search_available_inventory — used to build the rich,
  // category-aware description identical to the frontend (Admin Items / Messages tab).
  model_number?: string | null;
  storage_gb?: string | null;
  ram_gb?: string | null;
  cpu?: string | null;
  gpu?: string | null;
  screen_size?: number | null;
  color?: string | null;
  os_family?: string | null;
  year?: number | null;
  battery_health_pct?: number | null;
  is_unlocked?: boolean | null;
  has_touchscreen?: boolean | null;
  supplier_description?: string | null;
  category_description_fields?: string[] | null;
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
  // Spec fields returned by search_available_sell_groups — sourced from a representative
  // AVAILABLE member item (COALESCE with product_model) so the group description matches
  // the rich, category-aware P-code item description and the frontend getSellGroupDescription.
  model_number?: string | null;
  storage_gb?: string | null;
  ram_gb?: string | null;
  cpu?: string | null;
  gpu?: string | null;
  screen_size?: number | null;
  color?: string | null;
  os_family?: string | null;
  year?: number | null;
  battery_health_pct?: number | null;
  is_unlocked?: boolean | null;
  has_touchscreen?: boolean | null;
  category_description_fields?: string[] | null;
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

// Which product codes is the reply actually offering? The model fills the structured
// `offer_codes` field only intermittently, but it RELIABLY writes the order link
// (.../mine/<CODE>) and/or the bare code into its reply text. So derive the codes from the
// reply itself — links first, then bare P/G codes, then the model's own offer_codes — and
// keep only those the search actually returned (so we have a photo/price to show). This makes
// the offered-product photo deterministic instead of dependent on the model's bookkeeping.
export function deriveOfferCodes(
  replyText: string,
  modelOfferCodes: string[] | undefined,
  catalog: Map<string, InventorySearchResult>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const code = raw.toUpperCase();
    if (catalog.has(code) && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  };
  const text = replyText ?? '';
  for (const m of text.matchAll(/\/mine\/([a-z]\d{4,})/gi)) add(m[1]);
  for (const m of text.matchAll(/\b([pg]\d{4,})\b/gi)) add(m[1]);
  for (const c of modelOfferCodes ?? []) add(c);
  return out;
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
    const desc = getItemDescription(
      r as unknown as Record<string, unknown>,
      null,
      r.category_description_fields ?? null,
    ) || [r.brand, r.model_name].filter(Boolean).join(' ') || '—';
    const notesAlreadyShown = (r.category_description_fields ?? []).includes('condition_notes');
    return {
      type: 'item' as const,
      code: r.item_code,
      description: (r.condition_notes && !notesAlreadyShown) ? `${desc} — ${r.condition_notes}` : desc,
      grade: r.condition_grade,
      price,
      available_count: 1,
      thumbnail_url: thumb,
      display_url: display,
      order_url: buildOrderUrl(base, r.item_code),
    };
  });

  const groupResults: InventorySearchResult[] = groups.map((g) => {
    const desc = getItemDescription(
      g as unknown as Record<string, unknown>,
      null,
      g.category_description_fields ?? null,
    ) || [g.brand, g.model_name].filter(Boolean).join(' ') || '—';
    return {
      type: 'sell_group' as const,
      code: g.sell_group_code,
      description: desc,
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

  // 1. Exact code first. Live-selling photos show the P-code / G-code prominently, so if the
  //    query contains one (even buried in a longer string like "P001443 Oppo A5 5G"), look it
  //    up directly — it's the precise listing the customer is asking about. Only fall through
  //    to a text search if that exact code isn't currently available (e.g. it was sold).
  const codeMatch = q.match(/\b([pg]\d{4,})\b/i);
  if (codeMatch) {
    const byCode = await runInventorySearch(supabase, codeMatch[1].toUpperCase(), args);
    if (byCode.length > 0) return byCode;
  }

  // 2. Text search. The RPCs match the query as a single ILIKE substring against brand+model,
  //    so an over-specific query like "Oppo A5 5G 4GB 128GB Aurora Green" matches nothing even
  //    though "Oppo A5 5G" is in stock. Fall back to progressively shorter prefixes (brand+model
  //    is almost always first) so a real item is never reported "not available" on phrasing alone.
  let results = await runInventorySearch(supabase, q, args);
  if (results.length === 0 && q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    for (const take of [4, 3, 2]) {
      if (tokens.length <= take) continue;
      results = await runInventorySearch(supabase, tokens.slice(0, take).join(' '), args);
      if (results.length > 0) break;
    }
  }
  return results;
}

async function runInventorySearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  args: InventorySearchArgs,
): Promise<InventorySearchResult[]> {
  const common = {
    search_query: query,
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
