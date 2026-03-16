import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(yen: number | null | undefined): string {
  if (yen == null) return '—'
  return `¥${yen.toLocaleString('ja-JP')}`
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
