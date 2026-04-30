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
