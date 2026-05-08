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

// --- Cost calculations ---

/**
 * Minimal shape an object must have for getItemTotalCost.
 * Accepts both the joined query result (item_costs as array of {amount})
 * and an explicit pre-summed shape.
 */
export interface ItemWithCosts {
  purchase_price: number | null
  item_costs?: Array<{ amount: number | string | null }> | null
}

/** Sum of all item_costs.amount rows, coerced to number. Returns 0 when none. */
export function sumItemCosts(item: { item_costs?: Array<{ amount: number | string | null }> | null }): number {
  const rows = item.item_costs ?? []
  return rows.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
}

/** purchase_price + Σ item_costs.amount. Both sides coerced safely. */
export function getItemTotalCost(item: ItemWithCosts): number {
  return (Number(item.purchase_price) || 0) + sumItemCosts(item)
}
