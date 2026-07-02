// Single home for human-readable timestamp formatting. All output renders in Asia/Tokyo
// (JST) regardless of the viewer's device timezone — the business and its customers are in
// Japan and the UI must match Missive. DISPLAY ONLY: storage, queries, sorting, and date
// math stay in UTC. Do NOT use these for query params or values written back to the DB.
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

export const APP_TIME_ZONE = 'Asia/Tokyo'

function toZoned(dateString: string): TZDate {
  return new TZDate(new Date(dateString), APP_TIME_ZONE)
}

// yyyy-MM-dd in JST.
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'yyyy-MM-dd')
}

// yyyy-MM-dd HH:mm in JST.
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'yyyy-MM-dd HH:mm')
}

// HH:mm in JST — message-bubble times.
export function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'HH:mm')
}

// JST-aware day label for message-thread separators: "Today" / "Yesterday" / "MMM d".
// Compares the JST calendar date of the message against JST "now" (injectable for tests).
export function formatDayLabel(
  dateString: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!dateString) return ''
  const dayKey = formatDate(dateString) // yyyy-MM-dd in JST
  const nowKey = format(new TZDate(now, APP_TIME_ZONE), 'yyyy-MM-dd')
  if (dayKey === nowKey) return 'Today'
  const yesterday = new TZDate(now, APP_TIME_ZONE)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey === format(yesterday, 'yyyy-MM-dd')) return 'Yesterday'
  return format(toZoned(dateString), 'MMM d')
}
