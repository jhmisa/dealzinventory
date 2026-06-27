import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { getSpecFieldLabel } from '@/lib/constants'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(yen: number | null | undefined): string {
  if (yen == null) return '—'
  return `¥${yen.toLocaleString('ja-JP')}`
}

/**
 * Normalize a free-text storage value to integer GB. Mirrors the SQL helper
 * `public._backorder_norm_storage_gb` and the Deno verifier `normalizeStorageGb`
 * in supabase/functions/_shared/backorder-match.ts (keep all three in sync).
 *
 * Rules: extract the leading digit run; if the string matches /tb/i, multiply by
 * 1000 (TB→GB). Numbers pass through (floored). NULL / no digits → null.
 * Examples: '128GB'→128, '1TB'→1000, '256GB SSD'→256, '128'→128, 512→512.
 */
export function normalizeStorageGb(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null
  if (typeof v !== 'string') return null
  const m = v.match(/(\d+)/)
  if (!m) return null
  const gb = parseInt(m[1], 10)
  if (Number.isNaN(gb)) return null
  return /t\s*b/i.test(v) ? gb * 1000 : gb
}

/**
 * Core spec fields that must match between an item (P-code) and a backorder line
 * for a fulfillment swap. Mirrors CORE_FIELDS in the Deno verifier
 * (supabase/functions/_shared/backorder-match.ts) and the SQL hard-block in
 * fulfill_backorder_with_item — keep all three in sync.
 */
export const BACKORDER_CORE_FIELDS = [
  'product_id',
  'storage_gb',
  'color',
  'condition_grade',
] as const

export type BackorderCoreField = (typeof BACKORDER_CORE_FIELDS)[number]

export interface PCodeMatchResult {
  ok: boolean
  fields: Array<{
    field: BackorderCoreField
    itemValue: unknown
    lineValue: unknown
    match: boolean
  }>
  blocking: BackorderCoreField[]
}

function normCompare(v: unknown): unknown {
  return typeof v === 'string' ? v.trim().toLowerCase() : v
}

/**
 * Field-by-field core-spec comparison between an item and a backorder line.
 * Mirrors verifyPCodeMatch in the Deno verifier so the client preview matches
 * the authoritative server hard-block. The server re-enforces this in the RPC.
 *
 * Rules: storage_gb compares via normalizeStorageGb on both sides (items.storage_gb
 * is messy free-text, lines.storage_gb is integer); color is case/space-insensitive;
 * product_id + condition_grade are strict.
 */
export function verifyPCodeMatch(
  item: Record<string, unknown>,
  line: Record<string, unknown>,
): PCodeMatchResult {
  const fields = BACKORDER_CORE_FIELDS.map((f) => {
    const match =
      f === 'storage_gb'
        ? normalizeStorageGb(item[f]) === normalizeStorageGb(line[f])
        : normCompare(item[f]) === normCompare(line[f])
    return { field: f, itemValue: item[f], lineValue: line[f], match }
  })
  const blocking = fields.filter((f) => !f.match).map((f) => f.field)
  return { ok: blocking.length === 0, fields, blocking }
}

/**
 * Compute effective pricing for a sell group from its discount_amount and a representative member item.
 * Under the new model (D1–D3), all members share the same selling_price, so any non-null member works.
 * Returns 0s if no representative item is available.
 */
export function getSellGroupPricing(
  discountAmount: number | null | undefined,
  representativeItem?: { selling_price?: number | null } | null | undefined,
): { sellingPrice: number; discount: number; effectivePrice: number; hasDiscount: boolean } {
  const sellingPrice = Number(representativeItem?.selling_price ?? 0)
  const discount = Number(discountAmount ?? 0)
  const effectivePrice = Math.max(0, sellingPrice - discount)
  return { sellingPrice, discount, effectivePrice, hasDiscount: discount > 0 }
}

/**
 * Pluck the first member item from a sell-group response shape (for use with getSellGroupPricing).
 * Accepts both `sell_group_items: [{ items: ... }]` and an array of items directly.
 */
export function getRepresentativeMember<T extends { selling_price?: number | null }>(
  sgItems: Array<{ items?: T | null } | T | null> | null | undefined,
): T | null {
  if (!sgItems || sgItems.length === 0) return null
  for (const sgi of sgItems) {
    if (sgi == null) continue
    const candidate = (sgi as { items?: T | null }).items ?? (sgi as T)
    if (candidate && (candidate as T).selling_price != null) return candidate as T
  }
  return null
}

export function formatCustomerName(customer: { last_name: string; first_name?: string | null }): string {
  return `${customer.first_name ?? ''} ${customer.last_name}`.trim()
}

export function formatCode(code: string): string {
  return code
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new Date(dateString), 'yyyy-MM-dd')
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new Date(dateString), 'yyyy-MM-dd HH:mm')
}

/**
 * Build a short description string from field values using an ordered list of field keys.
 * Used by product forms and item table display.
 */
export function buildShortDescription(
  values: Record<string, unknown>,
  descriptionFields: string[],
): string {
  return descriptionFields
    .map((key) => {
      const val = values[key]
      if (val == null || val === '' || val === false) return null
      if (key === 'ram_gb' && val) return String(val)
      if (key === 'storage_gb' && val) return String(val)
      if (key === 'screen_size' && val) return `${val}"`
      if (key === 'battery_health_pct' && val) return `Battery ${val}%`
      if (key === 'condition_notes' && val) return String(val)
      if (typeof val === 'boolean') return val ? getSpecFieldLabel(key) : null
      return String(val)
    })
    .filter(Boolean)
    .join(' ')
}

/**
 * Build a full item description using category description_fields when available,
 * falling back to basic spec concatenation. Shared between Admin Items and Messaging search.
 */
export function getItemDescription(
  item: Record<string, unknown>,
  productModel?: Record<string, unknown> | null,
  descriptionFields?: string[] | null,
): string {
  if (descriptionFields && descriptionFields.length > 0) {
    const resolvedValues: Record<string, unknown> = {}
    for (const key of descriptionFields) {
      resolvedValues[key] = item[key] ?? productModel?.[key]
    }
    return buildShortDescription(resolvedValues, descriptionFields) || (item.supplier_description as string) || ''
  }
  const brand = item.brand ?? productModel?.brand
  const modelName = item.model_name ?? productModel?.model_name
  const fullModel = brand && modelName ? `${brand} ${modelName}` : null
  const screenSize = item.screen_size ?? productModel?.screen_size
  const parts = [
    fullModel,
    item.cpu,
    item.ram_gb,
    item.storage_gb,
    screenSize ? `${screenSize}"` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : ((item.supplier_description as string) || '')
}

/**
 * Build a sell group's description by picking a representative member item and
 * delegating to getItemDescription. Honors per-item field overrides and the
 * model's category description_fields config — so every surface (Admin Sell
 * Groups list, Messages inventory send, public /mine page) renders identically.
 *
 * Falls back to the sell group's own product_models join if no member items are
 * present (e.g. an empty group).
 */
export function getSellGroupDescription(sg: {
  product_models?: Record<string, unknown> | null
  sell_group_items?: Array<{ items?: Record<string, unknown> | null } | null> | null
}): string {
  const rep =
    (sg.sell_group_items ?? [])
      .map((s) => s?.items ?? null)
      .find((it): it is Record<string, unknown> => it != null) ?? null
  const pm =
    (rep?.product_models as Record<string, unknown> | undefined) ??
    (sg.product_models as Record<string, unknown> | undefined) ??
    null
  const descFields =
    ((pm?.categories as { description_fields?: string[] | null } | undefined)?.description_fields) ?? null
  return getItemDescription((rep ?? {}) as Record<string, unknown>, pm, descFields)
}

const EMOTICON_MAP: [RegExp, string][] = [
  [/(?<!\w):\)(?!\w)/g, '😊'],
  [/(?<!\w);\)(?!\w)/g, '😉'],
  [/(?<!\w):D(?!\w)/g, '😄'],
  [/(?<!\w):\((?!\w)/g, '😞'],
  [/(?<!\w):P(?!\w)/g, '😛'],
  [/(?<!\w)<3(?!\w)/g, '❤️'],
  [/(?<!\w):o(?!\w)/gi, '😮'],
  [/(?<!\w)xD(?!\w)/gi, '😆'],
  [/(?<!\w):\|(?!\w)/g, '😐'],
  [/(?<!\w)>:\((?!\w)/g, '😠'],
  [/(?<!\w):'\((?!\w)/g, '😢'],
  [/(?<!\w)\^\^(?!\w)/g, '😊'],
]

export function convertEmoticonsToEmoji(text: string): string {
  let result = text
  for (const [pattern, emoji] of EMOTICON_MAP) {
    result = result.replace(pattern, emoji)
  }
  return result
}

/**
 * Decode the HTML entities that Missive (and other HTML email/chat sources) leave
 * in message bodies after tags are stripped — e.g. `&nbsp;`, `&#39;`, `&amp;`.
 * Without this, raw entity codes render literally in plain-text message bubbles.
 * `&amp;` is decoded last so we never double-decode (e.g. `&amp;#39;` stays `&#39;`,
 * not `'`). Mirrors the decoder in the missive-webhook / backfill Edge Functions.
 */
export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

// --- Cost calculations ---

/** A single row from the item_costs embed — shape matches what PostgREST returns. */
export type ItemCostRow = { amount: number | string | null }

/**
 * Minimal shape an object must have for getItemTotalCost.
 * Accepts both the joined query result (item_costs as array of {amount})
 * and an explicit pre-summed shape.
 */
export interface ItemWithCosts {
  purchase_price: number | null
  item_costs?: Array<ItemCostRow> | null
}

/** Sum of all item_costs.amount rows, coerced to number. Returns 0 when none. */
export function sumItemCosts(item: { item_costs?: Array<ItemCostRow> | null }): number {
  const rows = item.item_costs ?? []
  return rows.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
}

/** purchase_price + Σ item_costs.amount. Both sides coerced safely. */
export function getItemTotalCost(item: ItemWithCosts): number {
  return (Number(item.purchase_price) || 0) + sumItemCosts(item)
}

export function filterHiddenProductMedia<T extends { id: string }>(
  media: T[],
  hiddenIds: string[] | null | undefined,
): T[] {
  if (!hiddenIds || hiddenIds.length === 0) return media
  const hidden = new Set(hiddenIds)
  return media.filter(m => !hidden.has(m.id))
}
