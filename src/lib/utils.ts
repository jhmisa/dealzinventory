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
